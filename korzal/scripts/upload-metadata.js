/**
 * Sube imagen y metadata JSON a IPFS via Pinata
 * Ejecutar ANTES de los scripts de creación de tokens
 *
 * npm install @pinata/sdk
 * PINATA_JWT=xxx node upload-metadata.js
 */

import pinataSDK from "@pinata/sdk";
import fs from "fs";
import path from "path";

const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT });

const TOKENS_METADATA = {
  KRZL: {
    imagePath: "./assets/krzl-logo.png",
    metadata: {
      name: "KORZAL Protocol",
      symbol: "KRZL",
      description:
        "KORZAL es el protocolo financiero descentralizado para América Latina. " +
        "Convierte USDT a moneda local al instante con fees menores al 0.5%.",
      external_url: "https://korzal.finance",
      attributes: [
        { trait_type: "Network",   value: "Solana" },
        { trait_type: "Category",  value: "DeFi / Payments" },
        { trait_type: "Region",    value: "Latin America" },
      ],
    },
  },
  BALAM: {
    imagePath: "./assets/balam-jaguar.png",
    metadata: {
      name: "BALAM",
      symbol: "BALAM",
      description:
        "BALAM (Jaguar Maya) es la mascota memecoin de KORZAL Protocol. " +
        "La puerta de entrada al ecosistema financiero descentralizado de LATAM. 🐆",
      external_url: "https://korzal.finance/balam",
      attributes: [
        { trait_type: "Network",   value: "Solana" },
        { trait_type: "Category",  value: "Memecoin" },
        { trait_type: "Animal",    value: "Jaguar" },
        { trait_type: "Origin",    value: "Mayan" },
      ],
    },
  },
};

async function uploadTokenMetadata(tokenKey) {
  const config = TOKENS_METADATA[tokenKey];
  console.log(`\nSubiendo assets de $${tokenKey}...`);

  // 1. Subir imagen
  if (!fs.existsSync(config.imagePath)) {
    throw new Error(`Imagen no encontrada: ${config.imagePath}`);
  }
  const imageStream = fs.createReadStream(config.imagePath);
  const imageResult = await pinata.pinFileToIPFS(imageStream, {
    pinataMetadata: { name: `${tokenKey.toLowerCase()}-logo` },
  });
  const imageUri = `ipfs://${imageResult.IpfsHash}`;
  console.log(`  ✓ Imagen: ${imageUri}`);

  // 2. Subir metadata JSON con la imagen referenciada
  const fullMetadata = {
    ...config.metadata,
    image: imageUri,
    properties: {
      files: [{ uri: imageUri, type: "image/png" }],
      category: "image",
    },
  };
  const jsonResult = await pinata.pinJSONToIPFS(fullMetadata, {
    pinataMetadata: { name: `${tokenKey.toLowerCase()}-metadata` },
  });
  const metadataUri = `ipfs://${jsonResult.IpfsHash}`;
  console.log(`  ✓ Metadata: ${metadataUri}`);

  return { imageUri, metadataUri };
}

async function main() {
  if (!process.env.PINATA_JWT) {
    throw new Error("Configura PINATA_JWT en tu .env");
  }

  const results = {};

  for (const token of ["KRZL", "BALAM"]) {
    results[token] = await uploadTokenMetadata(token);
  }

  // Guardar URIs para usar en los scripts de deploy
  fs.writeFileSync("./metadata-uris.json", JSON.stringify(results, null, 2));

  console.log("\n=== URIs listas para deployment ===");
  console.log(JSON.stringify(results, null, 2));
  console.log(
    "\nAgrega estas variables a tu .env:\n" +
    `KRZL_METADATA_URI=${results.KRZL.metadataUri}\n` +
    `BALAM_METADATA_URI=${results.BALAM.metadataUri}`
  );
}

main().catch(console.error);
