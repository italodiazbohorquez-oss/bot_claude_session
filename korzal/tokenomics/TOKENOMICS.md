# KORZAL Protocol — Tokenomics

> Fuente: Whitepaper v1.0 | korzal.io

## $KRL — Token Principal

```
Supply Total: 10,000,000 KRL (fijo, sin inflación programada)
Decimales: 9
Blockchain: Solana
Ticker: KRL
```

### Distribución

| Asignación | % | Cantidad | Vesting / Condición |
|------------|---|----------|---------------------|
| Venta Pública (IDO) | 25% | 2,500,000 | Liberación inmediata al listar |
| Liquidez del Protocolo | 20% | 2,000,000 | Bloqueado en smart contract |
| Equipo y Fundadores | 15% | 1,500,000 | Cliff 12 meses + vesting 24 meses |
| Ecosistema y Grants | 15% | 1,500,000 | Liberación trimestral, 3 años |
| Reserva Estratégica | 10% | 1,000,000 | Multi-sig 5/9. Solo por gobernanza |
| Recompensas Staking | 10% | 1,000,000 | Distribución automática, 4 años |
| Marketing y Comunidad | 5% | 500,000 | Uso discrecional del equipo |
| **TOTAL** | **100%** | **10,000,000** | |

> El equipo no puede acceder a sus tokens durante los primeros 12 meses (cliff).
> Los contratos de vesting son públicos y auditables en Solana Explorer.

### Mecanismo Deflacionario

```
Cada fee cobrado en $KRL:
  50% → Proveedores de liquidez (incentivo)
  30% → Treasury del protocolo
  20% → Quemado permanentemente 🔥
```

A mayor adopción → más fees → más tokens quemados → supply decrece → precio sube.

---

## $BALAM — Memecoin Jaguar Maya

```
Supply Total: 10,000,000,000 BALAM (10 billones)
Decimales: 6
Blockchain: Solana
```

### Distribución

| Asignación | % | Cantidad | Nota |
|------------|---|----------|------|
| Liquidez DEX | 60% | 6,000,000,000 | Precio inicial de mercado |
| Airdrops Comunidad | 20% | 2,000,000,000 | Holders tempranos |
| Marketing Viral | 10% | 1,000,000,000 | Campañas, KOLs, memes |
| Treasury KORZAL | 10% | 1,000,000,000 | Fondos para desarrollo |

### Relación con $KRL

- Convertible a $KRL a tasa fija dentro del protocolo
- 1% de cada tx $BALAM → treasury KORZAL
- Sin utilidad técnica propia (honestidad = confianza)
- Onboarding: usuario compra $BALAM → entra al ecosistema → descubre $KRL

---

## Precio de Lanzamiento Estimado

### $KRL (IDO)
```
IDO: 2,500,000 KRL a precio de venta pública
Liquidez inicial: 2,000,000 KRL bloqueados en contrato
```

### $BALAM
```
Liquidez inicial: 10,000 USDC + 6,000,000,000 BALAM
Precio inicial:   $0.0000017 por BALAM
```

---

## Seguridad y Transparencia

- Mint authority revocada post-deployment (supply inmutable)
- Freeze authority revocada (nadie puede congelar cuentas)
- Reserva estratégica en multisig 5/9
- Timelock 48h en cambios críticos del protocolo
- Contratos verificados en Solana Explorer / Solscan
- Auditoría de smart contract por firma especializada (pre-lanzamiento)
- Programa de bug bounty con recompensas en KRL
- Código open-source en GitHub
