/**
 * KORZAL Protocol — $KRZL Token Creation Script
 * Solana SPL Token + Metaplex Metadata
 *
 * Requirements:
 *   npm install @solana/web3.js @solana/spl-token \
 *     @metaplex-foundation/umi \
 *     @metaplex-foundation/umi-bundle-defaults \
 *     @metaplex-foundation/mpl-token-metadata
 */

import {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
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

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const NETWORK = "mainnet-beta"; // cambiar a "devnet" para pruebas
const RPC_URL = process.env.RPC_URL || clusterApiUrl(NETWORK);

const TOKEN_CONFIG = {
  name: "KORZAL Protocol",
  symbol: "KRL",
  decimals: 9,
  totalSupply: 10_000_000, // 10 millones

  metadataUri: process.env.KRL_METADATA_URI || "",

  // Distribución según whitepaper v1.0
  distribution: {
    ido:       0.25,  // 2,500,000 — venta pública IDO (liberación inmediata)
    liquidity: 0.20,  // 2,000,000 — liquidez del protocolo (locked en contrato)
    team:      0.15,  // 1,500,000 — equipo (cliff 12m + vesting 24m)
    ecosystem: 0.15,  // 1,500,000 — ecosistema y grants (trimestral, 3 años)
    reserve:   0.10,  // 1,000,000 — reserva estratégica (multisig 5/9)
    staking:   0.10,  // 1,000,000 — recompensas staking (automático, 4 años)
    marketing: 0.05,  //   500,000 — marketing y comunidad
  },
};

// ─── WALLETS DE DESTINO (completar antes de ejecutar) ────────────────────────
const WALLETS = {
  ido:       process.env.WALLET_IDO       || "",  // venta pública
  liquidity: process.env.WALLET_LIQUIDITY || "",  // protocolo DEX
  team:      process.env.WALLET_TEAM      || "",  // equipo (vesting)
  ecosystem: process.env.WALLET_ECOSYSTEM || "",  // grants
  reserve:   process.env.WALLET_RESERVE   || "",  // reserva multisig 5/9
  staking:   process.env.WALLET_STAKING   || "",  // contrato de staking
  marketing: process.env.WALLET_MARKETING || "",  // marketing
};

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function createKRZLToken() {
  validateConfig();

  const connection = new Connection(RPC_URL, "confirmed");
  const secretKey = JSON.parse(fs.readFileSync("./deployer-wallet.json"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("\n=== KORZAL Protocol — $KRL Token Deployment ===");
  console.log("Deployer:", payer.publicKey.toBase58());
  console.log("Network:", NETWORK);
  console.log("Supply:", TOKEN_CONFIG.totalSupply.toLocaleString(), "KRZL");

  // 1. Crear el mint
  console.log("\n[1/5] Creando mint...");
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,  // mint authority (se revoca al final)
    payer.publicKey,  // freeze authority (se revoca al final)
    TOKEN_CONFIG.decimals
  );
  console.log("✓ Mint address:", mint.toBase58());

  // 2. Agregar metadata via Metaplex
  console.log("\n[2/5] Agregando metadata...");
  await addMetadata(mint, payer);
  console.log("✓ Metadata agregada");

  // 3. Mintear supply completo al deployer
  console.log("\n[3/5] Minteando supply...");
  const deployerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, payer.publicKey
  );
  const totalAmount = BigInt(TOKEN_CONFIG.totalSupply) * BigInt(10 ** TOKEN_CONFIG.decimals);
  await mintTo(connection, payer, mint, deployerTokenAccount.address, payer, totalAmount);
  console.log("✓ Supply minteado:", TOKEN_CONFIG.totalSupply.toLocaleString(), "KRL");

  // 4. Distribuir a wallets según tokenomics
  console.log("\n[4/5] Distribuyendo tokens...");
  await distributeTokens(connection, payer, mint);

  // 5. Revocar mint authority y freeze authority
  console.log("\n[5/5] Revocando mint authority (supply fijo para siempre)...");
  await setAuthority(connection, payer, mint, payer, AuthorityType.MintTokens, null);
  await setAuthority(connection, payer, mint, payer, AuthorityType.FreezeAccount, null);
  console.log("✓ Mint authority revocada — nadie puede crear más KRL");
  console.log("✓ Freeze authority revocada — nadie puede congelar cuentas");

  const deploymentInfo = {
    token: "KRL",
    mintAddress: mint.toBase58(),
    network: NETWORK,
    totalSupply: TOKEN_CONFIG.totalSupply,
    decimals: TOKEN_CONFIG.decimals,
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync("./krl-deployment.json", JSON.stringify(deploymentInfo, null, 2));

  console.log("\n=== DEPLOYMENT EXITOSO ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("\nVerifica en: https://solscan.io/token/" + mint.toBase58());
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

async function distributeTokens(connection, payer, mint) {
  const total = TOKEN_CONFIG.totalSupply;
  const decimals = BigInt(10 ** TOKEN_CONFIG.decimals);
  const dist = TOKEN_CONFIG.distribution;

  const allocations = [
    { name: "IDO / Venta Pública",     wallet: WALLETS.ido,       amount: BigInt(Math.floor(total * dist.ido))       },
    { name: "Liquidez Protocolo",      wallet: WALLETS.liquidity, amount: BigInt(Math.floor(total * dist.liquidity)) },
    { name: "Equipo (cliff 12m)",      wallet: WALLETS.team,      amount: BigInt(Math.floor(total * dist.team))      },
    { name: "Ecosistema y Grants",     wallet: WALLETS.ecosystem, amount: BigInt(Math.floor(total * dist.ecosystem)) },
    { name: "Reserva Estratégica",     wallet: WALLETS.reserve,   amount: BigInt(Math.floor(total * dist.reserve))   },
    { name: "Staking Rewards",         wallet: WALLETS.staking,   amount: BigInt(Math.floor(total * dist.staking))   },
    { name: "Marketing y Comunidad",   wallet: WALLETS.marketing, amount: BigInt(Math.floor(total * dist.marketing)) },
  ];

  await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);

  for (const alloc of allocations) {
    if (!alloc.wallet) {
      console.log(`  ⚠ Wallet no configurada para: ${alloc.name} — saltando`);
      continue;
    }
    const destPubkey = new PublicKey(alloc.wallet);
    const destAccount = await getOrCreateAssociatedTokenAccount(
      connection, payer, mint, destPubkey
    );
    await mintTo(connection, payer, mint, destAccount.address, payer, alloc.amount * decimals);
    console.log(`  ✓ ${alloc.name}: ${alloc.amount.toLocaleString()} KRL → ${alloc.wallet.slice(0, 8)}...`);
  }
}

function validateConfig() {
  if (!TOKEN_CONFIG.metadataUri) {
    throw new Error("KRL_METADATA_URI no configurado. Ejecuta upload-metadata.js primero.");
  }
  if (!fs.existsSync("./deployer-wallet.json")) {
    throw new Error("deployer-wallet.json no encontrado.");
  }
  const totalDist = Object.values(TOKEN_CONFIG.distribution).reduce((a, b) => a + b, 0);
  if (Math.abs(totalDist - 1.0) > 0.001) {
    throw new Error(`Distribución no suma 100%: ${totalDist * 100}%`);
  }
}

createKRZLToken().catch(console.error);
