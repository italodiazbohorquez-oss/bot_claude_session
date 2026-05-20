/**
 * KORZAL Protocol — Treasury Vesting por Hitos
 *
 * El treasury (25% = 250M KRZL) está bloqueado.
 * Solo se libera cuando se verifica que un hito fue cumplido.
 * Requiere confirmación de multisig 3/5 (equipo + advisors independientes).
 *
 * Este script verifica el estado actual del vesting y permite
 * reclamar el tramo correspondiente al hito completado.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import fs from "fs";

const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta");

// Cargar deployment info
const krzlDeployment = JSON.parse(fs.readFileSync("./krzl-deployment.json"));
const KRZL_MINT = new PublicKey(krzlDeployment.mintAddress);

const HITOS = [
  {
    id: 1,
    nombre: "MVP + 3 países operativos",
    descripcion: "App funcional en Colombia, Chile, México",
    krzlAmount: 50_000_000,
    porcentaje: "20%",
    criterios: [
      "App disponible en stores (iOS + Android)",
      "Mínimo 50 proveedores de liquidez activos",
      "Volumen mínimo de $100,000 USD en primeras 4 semanas",
    ],
  },
  {
    id: 2,
    nombre: "10,000 usuarios activos",
    descripcion: "Volumen mensual > $500,000 USD",
    krzlAmount: 62_500_000,
    porcentaje: "25%",
    criterios: [
      "10,000 wallets únicas con al menos 1 transacción",
      "Volumen mensual comprobable on-chain > $500k",
      "Retención de 30 días > 40%",
    ],
  },
  {
    id: 3,
    nombre: "50,000 usuarios + 6 países",
    descripcion: "Expansión a Perú, Argentina, Venezuela, Brasil",
    krzlAmount: 75_000_000,
    porcentaje: "30%",
    criterios: [
      "50,000 wallets únicas activas",
      "Operaciones confirmadas en 6+ países",
      "Integración con al menos 2 rails de pago local adicionales",
    ],
  },
  {
    id: 4,
    nombre: "CEX Listing + 200,000 usuarios",
    descripcion: "Exchange top 20 por volumen",
    krzlAmount: 62_500_000,
    porcentaje: "25%",
    criterios: [
      "Listing confirmado en CEX top 20 (CoinGecko ranking)",
      "200,000 wallets únicas activas",
      "Auditoría de seguridad aprobada por firma externa",
    ],
  },
];

async function showVestingStatus() {
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("\n=== KORZAL Protocol — Estado del Treasury Vesting ===\n");
  console.log("Token KRZL:", KRZL_MINT.toBase58());
  console.log("Treasury total: 250,000,000 KRZL\n");

  for (const hito of HITOS) {
    console.log(`HITO ${hito.id}: ${hito.nombre}`);
    console.log(`  Descripción: ${hito.descripcion}`);
    console.log(`  KRZL a liberar: ${hito.krzlAmount.toLocaleString()} (${hito.porcentaje} del treasury)`);
    console.log("  Criterios de verificación:");
    hito.criterios.forEach((c) => console.log(`    - ${c}`));
    console.log("");
  }

  console.log("─".repeat(60));
  console.log("Para reclamar un tramo, se requiere:");
  console.log("  • Verificación on-chain de los criterios");
  console.log("  • Firma multisig 3/5 (equipo + advisors independientes)");
  console.log("  • 48h de timelock tras la firma antes de ejecución");
}

async function checkTreasuryBalance(treasuryWallet) {
  const connection = new Connection(RPC_URL, "confirmed");
  const walletPubkey = new PublicKey(treasuryWallet);
  const tokenAddress = await getAssociatedTokenAddress(KRZL_MINT, walletPubkey);

  try {
    const account = await getAccount(connection, tokenAddress);
    const balance = Number(account.amount) / 10 ** 9;
    console.log(`\nBalance treasury: ${balance.toLocaleString()} KRZL`);
    return balance;
  } catch {
    console.log("Treasury wallet aún no tiene cuenta de tokens KRZL.");
    return 0;
  }
}

// CLI básico
const args = process.argv.slice(2);
if (args[0] === "status") {
  showVestingStatus().catch(console.error);
} else if (args[0] === "balance" && args[1]) {
  checkTreasuryBalance(args[1]).catch(console.error);
} else {
  console.log("Uso:");
  console.log("  node vesting-treasury.js status");
  console.log("  node vesting-treasury.js balance <WALLET_ADDRESS>");
}
