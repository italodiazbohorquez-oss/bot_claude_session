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
  symbol: "KRZL",
  decimals: 9,
  totalSupply: 1_000_000_000, // 1 billón

  // Subir imagen y metadata a IPFS primero (ver upload-metadata.js)
  metadataUri: process.env.KRZL_METADATA_URI || "",

  // Distribución del supply (en porcentajes)
  distribution: {
    liquidity: 0.30,    // 300M — liquidez DEX
    treasury: 0.25,     // 250M — vesting por hitos
    community: 0.20,    // 200M — ecosistema
    team: 0.15,         // 150M — vesting 24 meses
    advisors: 0.07,     //  70M — advisors
    reserve: 0.03,      //  30M — reserva legal
  },
};

// ─── WALLETS DE DESTINO (completar antes de ejecutar) ────────────────────────
const WALLETS = {
  treasury:  process.env.WALLET_TREASURY  || "",
  community: process.env.WALLET_COMMUNITY || "",
  team:      process.env.WALLET_TEAM      || "",
  advisors:  process.env.WALLET_ADVISORS  || "",
  reserve:   process.env.WALLET_RESERVE   || "",
};

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function createKRZLToken() {
  validateConfig();

  const connection = new Connection(RPC_URL, "confirmed");
  const secretKey = JSON.parse(fs.readFileSync("./deployer-wallet.json"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("\n=== KORZAL Protocol — $KRZL Token Deployment ===");
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
  console.log("✓ Supply minteado:", TOKEN_CONFIG.totalSupply.toLocaleString(), "KRZL");

  // 4. Distribuir a wallets según tokenomics
  console.log("\n[4/5] Distribuyendo tokens...");
  await distributeTokens(connection, payer, mint);

  // 5. Revocar mint authority y freeze authority
  console.log("\n[5/5] Revocando mint authority (supply fijo para siempre)...");
  await setAuthority(connection, payer, mint, payer, AuthorityType.MintTokens, null);
  await setAuthority(connection, payer, mint, payer, AuthorityType.FreezeAccount, null);
  console.log("✓ Mint authority revocada — nadie puede crear más KRZL");
  console.log("✓ Freeze authority revocada — nadie puede congelar cuentas");

  // Guardar info del deployment
  const deploymentInfo = {
    token: "KRZL",
    mintAddress: mint.toBase58(),
    network: NETWORK,
    totalSupply: TOKEN_CONFIG.totalSupply,
    decimals: TOKEN_CONFIG.decimals,
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync("./krzl-deployment.json", JSON.stringify(deploymentInfo, null, 2));

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
    { name: "Treasury (vesting hitos)", wallet: WALLETS.treasury,  amount: BigInt(Math.floor(total * dist.treasury))  },
    { name: "Community / Ecosistema",   wallet: WALLETS.community, amount: BigInt(Math.floor(total * dist.community)) },
    { name: "Equipo (vesting 24m)",     wallet: WALLETS.team,      amount: BigInt(Math.floor(total * dist.team))      },
    { name: "Advisors",                 wallet: WALLETS.advisors,  amount: BigInt(Math.floor(total * dist.advisors))  },
    { name: "Reserva Legal",            wallet: WALLETS.reserve,   amount: BigInt(Math.floor(total * dist.reserve))   },
    // La liquidez (30%) queda en el deployer para agregar al DEX manualmente
  ];

  const sourceAccount = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, payer.publicKey
  );

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
    console.log(`  ✓ ${alloc.name}: ${alloc.amount.toLocaleString()} KRZL → ${alloc.wallet.slice(0, 8)}...`);
  }
}

function validateConfig() {
  if (!TOKEN_CONFIG.metadataUri) {
    throw new Error("KRZL_METADATA_URI no configurado. Ejecuta upload-metadata.js primero.");
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
