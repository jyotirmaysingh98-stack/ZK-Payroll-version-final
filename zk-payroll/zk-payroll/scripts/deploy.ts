import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying PayrollRouter with account:", deployer.address);

  const PayrollRouter = await ethers.getContractFactory("PayrollRouter");
  const router = await PayrollRouter.deploy(deployer.address);
  await router.waitForDeployment();

  const address = await router.getAddress();
  console.log("PayrollRouter deployed to:", address);
  console.log(
    "Grant COMPLIANCE_ORACLE_ROLE to your KYC/attestation backend with:\n" +
      `  router.grantRole(await router.COMPLIANCE_ORACLE_ROLE(), <oracleAddress>)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
