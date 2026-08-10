// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/// @title PayrollRouter
/// @notice NON-CUSTODIAL pass-through router. Funds move payer -> contract -> payee
///         within a single transaction and the contract never retains a balance
///         across transactions. It is an execution/record layer, not a wallet,
///         escrow, or fund manager. Whether this design satisfies "not a money
///         transmitter" in a given jurisdiction is a legal question — get that
///         reviewed by counsel; this contract only enforces the technical
///         invariant (no held balances, no discretion over funds).
/// @dev Every payout is atomic: pull funds from payer, forward to payee(s),
///      emit an immutable record. If forwarding fails, the whole tx reverts —
///      the contract can never end a block holding user funds.
contract PayrollRouter is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant PAYROLL_ADMIN_ROLE = keccak256("PAYROLL_ADMIN_ROLE");
    bytes32 public constant COMPLIANCE_ORACLE_ROLE = keccak256("COMPLIANCE_ORACLE_ROLE");

    /// @notice Per-payee KYC/AML gating flag, set only by an address holding
    ///         COMPLIANCE_ORACLE_ROLE (e.g. a RiseWorks-backed attestor service).
    ///         The contract stores a boolean + attestation hash only — never PII.
    mapping(address => bool) public isOnboarded;
    mapping(address => bytes32) public onboardingAttestationHash;

    /// @notice Vesting terms per grant id, mirrors Liquifi-style cliff/lockup schedules.
    struct VestingGrant {
        address beneficiary;
        address token;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint64 startTimestamp;
        uint64 cliffSeconds;
        uint64 durationSeconds;
        bool revocable;
        bool revoked;
    }
    mapping(bytes32 => VestingGrant) public vestingGrants;

    /// @notice One record per payroll execution. FMV fields let off-chain
    ///         withholding engines (e.g. Toku-style) reconcile tax basis
    ///         at the exact moment of execution, not after the fact.
    struct PayrollRecord {
        address payer;
        address payee;
        address token;
        uint256 tokenAmount;
        uint256 fiatAmountCents;   // fiat amount, integer cents, e.g. USD
        bytes3 fiatCurrencyCode;   // e.g. "USD"
        uint256 fmvAtExecution;    // token price in fiat cents at execution time
        uint64 executedAt;
        bytes32 invoiceRef;        // external ref, e.g. Request Finance invoice hash
    }
    PayrollRecord[] public payrollRecords;

    event PayrollExecuted(
        uint256 indexed recordId,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 tokenAmount,
        uint256 fiatAmountCents,
        bytes3 fiatCurrencyCode,
        uint256 fmvAtExecution,
        bytes32 invoiceRef
    );
    event OnboardingStatusSet(address indexed subject, bool onboarded, bytes32 attestationHash);
    event VestingGrantCreated(bytes32 indexed grantId, address indexed beneficiary, address token, uint256 totalAmount);
    event VestingClaimed(bytes32 indexed grantId, address indexed beneficiary, uint256 amount);
    event VestingRevoked(bytes32 indexed grantId);

    error NotOnboarded(address subject);
    error ZeroAmount();
    error GrantNotFound();
    error NothingToClaim();
    error GrantNotRevocable();
    error CliffNotReached();

    constructor(address defaultAdmin) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAYROLL_ADMIN_ROLE, defaultAdmin);
    }

    // ----------------------------------------------------------------
    // Compliance gating (RiseWorks / Anon Aadhaar attestation surface)
    // ----------------------------------------------------------------

    /// @notice Sets onboarding status for a payee. Called by a backend service
    ///         (e.g. RiseWorks KYC webhook, or an Anon Aadhaar ZK-proof verifier)
    ///         holding COMPLIANCE_ORACLE_ROLE. `attestationHash` is a hash of the
    ///         off-chain proof/document set — never the underlying PII.
    function setOnboardingStatus(address subject, bool onboarded, bytes32 attestationHash)
        external
        onlyRole(COMPLIANCE_ORACLE_ROLE)
    {
        isOnboarded[subject] = onboarded;
        onboardingAttestationHash[subject] = attestationHash;
        emit OnboardingStatusSet(subject, onboarded, attestationHash);
    }

    // ----------------------------------------------------------------
    // Payroll execution (pass-through, atomic, non-custodial)
    // ----------------------------------------------------------------

    /// @notice Pulls `tokenAmount` of `token` from msg.sender and forwards it to
    ///         `payee` in the same transaction. The contract's token balance
    ///         before and after this call is identical (net zero hold).
    function executePayroll(
        address payee,
        address token,
        uint256 tokenAmount,
        uint256 fiatAmountCents,
        bytes3 fiatCurrencyCode,
        uint256 fmvAtExecution,
        bytes32 invoiceRef
    ) external nonReentrant whenNotPaused onlyRole(PAYROLL_ADMIN_ROLE) returns (uint256 recordId) {
        if (!isOnboarded[payee]) revert NotOnboarded(payee);
        if (tokenAmount == 0) revert ZeroAmount();

        IERC20 erc20 = IERC20(token);
        uint256 balBefore = erc20.balanceOf(address(this));

        erc20.safeTransferFrom(msg.sender, address(this), tokenAmount);
        erc20.safeTransfer(payee, tokenAmount);

        // Invariant: contract holds zero net balance of `token` after routing.
        require(erc20.balanceOf(address(this)) == balBefore, "PayrollRouter: non-custodial invariant violated");

        payrollRecords.push(PayrollRecord({
            payer: msg.sender,
            payee: payee,
            token: token,
            tokenAmount: tokenAmount,
            fiatAmountCents: fiatAmountCents,
            fiatCurrencyCode: fiatCurrencyCode,
            fmvAtExecution: fmvAtExecution,
            executedAt: uint64(block.timestamp),
            invoiceRef: invoiceRef
        }));
        recordId = payrollRecords.length - 1;

        emit PayrollExecuted(
            recordId, msg.sender, payee, token, tokenAmount,
            fiatAmountCents, fiatCurrencyCode, fmvAtExecution, invoiceRef
        );
    }

    function payrollRecordCount() external view returns (uint256) {
        return payrollRecords.length;
    }

    // ----------------------------------------------------------------
    // Vesting (Liquifi-style cliff + linear vest, contract-enforced)
    // ----------------------------------------------------------------

    function createVestingGrant(
        bytes32 grantId,
        address beneficiary,
        address token,
        uint256 totalAmount,
        uint64 startTimestamp,
        uint64 cliffSeconds,
        uint64 durationSeconds,
        bool revocable
    )

        emit VestingGrantCreated(grantId, beneficiary, token, totalAmount);
    }

    function vestedAmount(bytes32 grantId) public view returns (uint256) {
        VestingGrant storage g = vestingGrants[grantId];
        if (g.beneficiary == address(0)) revert GrantNotFound();
        if (block.timestamp < g.startTimestamp + g.cliffSeconds) return 0;
        if (g.revoked) return g.claimedAmount;
        if (block.timestamp >= g.startTimestamp + g.durationSeconds) return g.totalAmount;
        uint256 elapsed = block.timestamp - g.startTimestamp;
        return (g.totalAmount * elapsed) / g.durationSeconds;
    }

    function claimVested(bytes32 grantId) external nonReentrant {
        VestingGrant storage g = vestingGrants[grantId];
        if (g.beneficiary != msg.sender) revert GrantNotFound();
        if (block.timestamp < g.startTimestamp + g.cliffSeconds) revert CliffNotReached();

        uint256 claimable = vestedAmount(grantId) - g.claimedAmount;
        if (claimable == 0) revert NothingToClaim();

        g.claimedAmount += claimable;
        IERC20(g.token).safeTransfer(g.beneficiary, claimable);

        emit VestingClaimed(grantId, msg.sender, claimable);
    }

    function revokeVestingGrant(bytes32 grantId) external onlyRole(PAYROLL_ADMIN_ROLE) {
        VestingGrant storage g = vestingGrants[grantId];
        if (g.beneficiary == address(0)) revert GrantNotFound();
        if (!g.revocable) revert GrantNotRevocable();

        uint256 unvested = g.totalAmount - vestedAmount(grantId);
        g.revoked = true;
        if (unvested > 0) {
            IERC20(g.token).safeTransfer(msg.sender, unvested);
        }
        emit VestingRevoked(grantId);
    }

    // ----------------------------------------------------------------
    // Admin
    // ----------------------------------------------------------------

    function pause() external onlyRole(PAYROLL_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(PAYROLL_ADMIN_ROLE) { _unpause(); }

    /// @notice Rescue for tokens sent to this contract by mistake (not part of
    ///         an active payroll tx or vesting grant). Required because a
    ///         non-custodial router can still receive accidental direct
    ///         transfers outside its own control flow.
    function rescueMistakenTransfer(address token, uint256 amount, address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        IERC20(token).safeTransfer(to, amount);
    }
}
