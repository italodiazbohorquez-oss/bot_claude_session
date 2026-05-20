/**
 * KORZAL Protocol — $BALAM Memecoin (Jaguar Maya)
 * Token de comunidad para atracción y onboarding
 *
 * Requirements: mismas que create-krzl-token.js
 */

import {
  Connection,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createFungible,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  keypairIdentity,
  publicKey as umiPublicKey,
  percentAmount,
} from "@metaplex-foundation/umi";
import fs from "fs";

const NETWORK = "mainnet-beta";
const RPC_URL = process.env.RPC_URL || clusterApiUrl(NETWORK);

const TOKEN_CONFIG = {
  name: "BALAM",
  symbol: "BALAM",
  decimals: 6,                      // memecoins típicamente usan menos decimales
  totalSupply: 10_000_000_000,      // 10 billones

  metadataUri: process.env.BALAM_METADATA_URI || "",

  distribution: {
    liquidity:  0.60,   // 6B  — liquidez DEX (precio inicial)
    airdrops:   0.20,   // 2B  — comunidad y airdrops
    marketing:  0.10,   // 1B  — campañas virales
    treasury:   0.10,   // 1B  — treasury KORZAL Protocol
  },
};

async function createBALAMToken() {
  if (!TOKEN_CONFIG.metadataUri) {
    throw new Error("BALAM_METADATA_URI no configurado.");
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const secretKey = JSON.parse(fs.readFileSync("./deployer-wallet.json"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("\n=== BALAM — Jaguar Maya Memecoin Deployment ===");
  console.log("Network:", NETWORK);
  console.log("Supply:", TOKEN_CONFIG.totalSupply.toLocaleString(), "BALAM");

  console.log("\n[1/4] Creando mint...");
  const mint = await createMint(
    connection, payer,
    payer.publicKey,
    null,               // sin freeze authority desde el inicio
    TOKEN_CONFIG.decimals
  );
  console.log("✓ Mint:", mint.toBase58());

  console.log("\n[2/4] Agregando metadata...");
  await addMetadata(mint, payer);
  console.log("✓ Metadata lista");

  console.log("\n[3/4] Minteando supply completo...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, payer.publicKey
  );
  const totalAmount = BigInt(TOKEN_CONFIG.totalSupply) * BigInt(10 ** TOKEN_CONFIG.decimals);
  await mintTo(connection, payer, mint, tokenAccount.address, payer, totalAmount);
  console.log("✓", TOKEN_CONFIG.totalSupply.toLocaleString(), "BALAM minteados");

  console.log("\n[4/4] Revocando mint authority...");
  await setAuthority(connection, payer, mint, payer, AuthorityType.MintTokens, null);
  console.log("✓ Supply fijo para siempre — no se pueden crear más BALAM");

  const deploymentInfo = {
    token: "BALAM",
    mintAddress: mint.toBase58(),
    network: NETWORK,
    totalSupply: TOKEN_CONFIG.totalSupply,
    decimals: TOKEN_CONFIG.decimals,
    mintAuthorityRevoked: true,
    note: "Memecoin mascota de KORZAL Protocol — Jaguar Maya",
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync("./balam-deployment.json", JSON.stringify(deploymentInfo, null, 2));

  console.log("\n=== DEPLOYMENT EXITOSO ===");
  console.log("Mint address:", mint.toBase58());
  console.log("Verifica en: https://solscan.io/token/" + mint.toBase58());
}

async function addMetadata(mint, payer) {
  const umi = createUmi(RPC_URL).use(mplTokenMetadata());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
  umi.use(keypairIdentity(umiKeypair));

  await createFungible(umi, {
    mint: umiPublicKey(mint.toBase58()),
    name: TOKEN_CONFIG.name,
    symbol: TOKEN_CONFIG.symbol,
    uri: TOKEN_CONFIG.metadataUri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: TOKEN_CONFIG.decimals,
    isMutable: false,
  }).sendAndConfirm(umi);
}

createBALAMToken().catch(console.error);
