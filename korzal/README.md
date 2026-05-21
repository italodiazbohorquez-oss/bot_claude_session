# KORZAL Protocol

> Move value across Latin America instantly, cheaply, and without borders.

**$KRZL** — Token de utilidad y gobernanza  
**$BALAM** — Memecoin Jaguar Maya (mascota del protocolo)  
**Red**: Solana

---

## Estructura del Proyecto

```
korzal/
├── whitepaper/
│   └── WHITEPAPER.md          # Documento completo del proyecto
├── tokenomics/
│   └── TOKENOMICS.md          # Distribución y mecánicas de tokens
├── contracts/
│   ├── krzl/
│   │   └── create-krzl-token.js   # Deploy del token principal
│   └── balam/
│       └── create-balam-token.js  # Deploy del memecoin
├── scripts/
│   ├── upload-metadata.js     # Sube assets a IPFS via Pinata
│   └── vesting-treasury.js    # Gestión del treasury por hitos
├── assets/                    # Imágenes y logos (agregar aquí)
│   ├── krzl-logo.png
│   └── balam-jaguar.png
└── .env.example               # Variables de entorno necesarias
```

---

## Pasos para el Lanzamiento

### 1. Preparación
```bash
cp .env.example .env
# Editar .env con tus valores reales
npm install @solana/web3.js @solana/spl-token \
  @metaplex-foundation/umi \
  @metaplex-foundation/umi-bundle-defaults \
  @metaplex-foundation/mpl-token-metadata \
  @pinata/sdk
```

### 2. Agregar imágenes
Colocar en `assets/`:
- `krzl-logo.png` — Logo oficial KORZAL (512x512px mínimo)
- `balam-jaguar.png` — Jaguar Maya $BALAM (512x512px mínimo)

### 3. Subir metadata a IPFS
```bash
PINATA_JWT=xxx node scripts/upload-metadata.js
# Copia las URIs generadas a tu .env
```

### 4. Deploy en devnet (pruebas)
```bash
RPC_URL=https://api.devnet.solana.com node contracts/krzl/create-krzl-token.js
RPC_URL=https://api.devnet.solana.com node contracts/balam/create-balam-token.js
```

### 5. Deploy en mainnet
```bash
node contracts/krzl/create-krzl-token.js
node contracts/balam/create-balam-token.js
```

### 6. Crear liquidez en Raydium
- Ir a raydium.io → Liquidity → Create Pool
- Par: KRZL/USDC con 300M KRZL + liquidez USDC
- Par: BALAM/SOL con 6B BALAM + liquidez SOL

### 7. Verificar en Solscan
- Confirmar que mint authority aparece como `null`
- Verificar distribución de wallets

---

## Checklist Pre-Lanzamiento

- [ ] Imágenes diseñadas (logo KRZL + Jaguar BALAM)
- [ ] Metadata subida a IPFS/Arweave
- [ ] Deploy probado en devnet sin errores
- [ ] Wallets multisig configuradas (treasury, team, advisors)
- [ ] Auditoría de contratos (al menos herramientas automáticas)
- [ ] Deploy en mainnet
- [ ] Mint authority revocada ✓ (automático en el script)
- [ ] Liquidez inicial creada en Raydium
- [ ] Verificado en Solscan
- [ ] Twitter/X con lore del Jaguar Maya
- [ ] Telegram/Discord de comunidad
- [ ] Sitio web korzal.finance
- [ ] Solicitud en CoinGecko / CoinMarketCap

---

## Links Útiles

- Documentación Solana SPL Token: https://spl.solana.com/token
- Metaplex (metadata): https://docs.metaplex.com
- Raydium (DEX): https://raydium.io
- Pinata (IPFS): https://pinata.cloud
- Solscan (explorer): https://solscan.io
- Phantom Wallet: https://phantom.app
