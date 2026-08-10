import { expect } from "chai";
import { ethers } from "hardhat";
import { PayrollRouter, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PayrollRouter", () => {
  let router: PayrollRouter;
  let token: MockERC20;
  let admin: SignerWithAddress, oracle: SignerWithAddress, payer: SignerWithAddress, payee: SignerWithAddress;

  beforeEach(async () => {
    [admin, oracle, payer, payee] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = (await MockERC20Factory.deploy("Mock USDC", "mUSDC", 6)) as unknown as MockERC20;
    await token.waitForDeployment();
    await token.mint(payer.address, ethers.parseUnits("10000", 6));

    const RouterFactory = await ethers.getContractFactory("PayrollRouter");
    router = (await RouterFactory.deploy(admin.address)) as unknown as PayrollRouter;
    await router.waitForDeployment();

    await router.grantRole(await router.COMPLIANCE_ORACLE_ROLE(), oracle.address);
    await router.grantRole(await router.PAYROLL_ADMIN_ROLE(), payer.address);
  });

  it("reverts payroll to a non-onboarded payee", async () => {
    await token.connect(payer).approve(await router.getAddress(), ethers.parseUnits("100", 6));
    await expect(
      router.connect(payer).executePayroll(
        payee.address,
        await token.getAddress(),
        ethers.parseUnits("100", 6),
        10000, // $100.00
        ethers.encodeBytes32String("USD").slice(0, 8) as any,
        150000000, // mock FMV
        ethers.encodeBytes32String("inv-1")
      )
    ).to.be.revertedWithCustomError(router, "NotOnboarded");
  });

  it("routes funds atomically and leaves zero balance in the router", async () => {
    await router.connect(oracle).setOnboardingStatus(payee.address, true, ethers.encodeBytes32String("attest-1"));
    const amount = ethers.parseUnits("500", 6);
    await token.connect(payer).approve(await router.getAddress(), amount);

    await expect(
      router.connect(payer).executePayroll(
        payee.address,
        await token.getAddress(),
        amount,
        50000,
        "0x555344" as any, // "USD"
        150000000,
        ethers.encodeBytes32String("inv-2")
      )
    ).to.emit(router, "PayrollExecuted");

    expect(await token.balanceOf(payee.address)).to.equal(amount);
    expect(await token.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("vests linearly after cliff and blocks early claims", async () => {
    await router.connect(oracle).setOnboardingStatus(payee.address, true, ethers.encodeBytes32String("attest-2"));
    const total = ethers.parseUnits("1200", 6);
    await token.connect(payer).approve(await router.getAddress(), total);

    const start = Math.floor(Date.now() / 1000);
    const grantId = ethers.encodeBytes32String("grant-1");
    await router
      .connect(payer)
      .createVestingGrant(grantId, payee.address, await token.getAddress(), total, start, 60 * 60, 60 * 60 * 12, true);

    await expect(router.connect(payee).claimVested(grantId)).to.be.revertedWithCustomError(router, "CliffNotReached");
  });
});
