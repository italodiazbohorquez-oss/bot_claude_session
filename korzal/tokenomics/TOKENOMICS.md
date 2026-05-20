# KORZAL Protocol — Tokenomics

## $KRZL — Token Principal

```
Supply Total: 1,000,000,000 KRZL (fijo, no inflacionario)
Decimales: 9
Blockchain: Solana
```

### Distribución

| Asignación | % | Cantidad | Vesting |
|------------|---|----------|---------|
| Liquidez DEX | 30% | 300,000,000 | Sin lock (necesaria para cotizar) |
| Treasury Proyecto | 25% | 250,000,000 | Por hitos (ver abajo) |
| Comunidad / Ecosistema | 20% | 200,000,000 | 12 meses lineal |
| Equipo Fundador | 15% | 150,000,000 | Cliff 6m + vesting 24m |
| Advisors & Partners | 7% | 70,000,000 | Cliff 3m + vesting 12m |
| Reserva Legal | 3% | 30,000,000 | Multisig, uso específico |

### Treasury por Hitos

| Hito | Meta | KRZL Liberados | % Treasury |
|------|------|----------------|------------|
| 1 | MVP + 3 países (COL, CHL, MEX) | 50,000,000 | 20% |
| 2 | 10,000 usuarios + $500k vol/mes | 62,500,000 | 25% |
| 3 | 50,000 usuarios + 6 países | 75,000,000 | 30% |
| 4 | CEX Top 20 + 200,000 usuarios | 62,500,000 | 25% |

### Mecanismo Deflacionario

```
Cada fee cobrado en $KRZL:
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

### Relación con $KRZL

- Convertible a $KRZL a tasa fija dentro del protocolo
- 1% de cada tx $BALAM → treasury KORZAL
- Sin utilidad técnica propia (honestidad = confianza)
- Funciona como onboarding: usuario compra $BALAM → entra al ecosistema → descubre $KRZL

---

## Precio de Lanzamiento Estimado

### $KRZL
```
Liquidez inicial: 50,000 USDC + 300,000,000 KRZL
Precio inicial:   $0.000167 por KRZL
Market Cap inicial (circulante): ~$50,000 USD
FDV inicial: ~$167,000 USD
```

### $BALAM
```
Liquidez inicial: 10,000 USDC + 6,000,000,000 BALAM
Precio inicial:   $0.0000017 por BALAM
Market Cap inicial: ~$10,000 USD
```

---

## Seguridad y Transparencia

- ✅ Mint authority revocada post-deployment (supply inmutable)
- ✅ Freeze authority revocada (nadie puede congelar cuentas)
- ✅ Treasury en multisig 3/5
- ✅ Contratos verificados en Solscan
- ✅ Auditoría de smart contracts antes del Hito 1
- ✅ Código open-source en GitHub
