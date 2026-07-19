/**
 * USDC helpers for Base Sepolia
 *
 * Pool wallet: server-managed wallet that holds all bet USDC.
 * Set POOL_WALLET_ADDRESS in env, or use default.
 */

export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

// Pool wallet — receives all bets, sends payouts
// In production: use a multisig or smart contract
export const POOL_WALLET = process.env.NEXT_PUBLIC_POOL_WALLET || "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18";

// Minimal ERC-20 ABI for transfer + approve + balanceOf
export const ERC20_TRANSFER = "0xa9059cbb";   // transfer(address,uint256)
export const ERC20_APPROVE  = "0x095ea7b3";   // approve(address,uint256)
export const ERC20_BALANCE  = "0x70a08231";   // balanceOf(address)

export function encodeTransfer(to: string, amount: number): string {
  const addr = to.replace("0x", "").padStart(64, "0");
  const val = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS)).toString(16).padStart(64, "0");
  return ERC20_TRANSFER + addr + val;
}

export function encodeBalanceOf(addr: string): string {
  const a = addr.replace("0x", "").padStart(64, "0");
  return ERC20_BALANCE + a;
}
