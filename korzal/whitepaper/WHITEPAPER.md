# KORZAL Protocol — Whitepaper v1.0

> *Move value across Latin America instantly, cheaply, and without borders.*

---

## Abstract

KORZAL es un protocolo financiero descentralizado construido sobre Solana, diseñado para resolver el problema de los pagos transfronterizos en América Latina. Permite a cualquier persona convertir USDT a moneda local de forma instantánea, con fees menores al 0.5%, sin necesidad de cuenta bancaria y disponible 24/7.

El protocolo emite dos tokens:
- **$KRZL** — token de utilidad y gobernanza del protocolo
- **$BALAM** — memecoin mascota (Jaguar Maya) para atracción de comunidad

---

## 1. El Problema

América Latina concentra más de **400 millones de personas sub-bancarizadas**. El viajero, el trabajador remoto, el creador de contenido y el emprendedor enfrentan las mismas barreras:

| Problema | Impacto |
|----------|---------|
| Casas de cambio con spread del 5-10% | Pérdida directa de dinero |
| Plataformas tipo AstroPay con fees del 4-8% | Costo elevado de acceso |
| KYC obligatorio para montos pequeños | Exclusión de personas sin documentos |
| Disponibilidad solo en horario bancario | Fricción para transacciones urgentes |
| Cuentas locales limitadas por plataforma | Cobertura geográfica reducida |
| Bloqueo de tarjetas internacionales | Inseguridad para el viajero |

### Caso real

Un viajero llega a Colombia con USDT en su wallet. Para obtener COP necesita:
1. Encontrar una casa de cambio abierta
2. Mostrar pasaporte y hacer fila
3. Aceptar un tipo de cambio desfavorable (spread 6-8%)
4. Esperar hasta 30 minutos

**Con KORZAL: 90 segundos, fee 0.3%, sin fila, sin horario.**

---

## 2. La Solución KORZAL

KORZAL es una red de liquidez P2P con escrow automático via smart contracts en Solana.

### Flujo del usuario

```
Usuario (viajero/creador/emprendedor)
         │
         │  Tiene USDT en wallet Phantom/Backpack
         ▼
   App KORZAL
         │
         │  Selecciona país destino y monto
         ▼
   Smart Contract (escrow)
         │
         │  Match automático con proveedor de liquidez local
         ▼
   Proveedor Local
         │  Persona o empresa con moneda local
         │  que quiere USDT
         ▼
   Confirmación dual → fondos liberados automáticamente

   Usuario recibe: COP / CLP / MXN / PEN / ARS / BRL
   Proveedor recibe: USDT
   Fee total: 0.3%
```

### Ventajas vs competencia

| Feature | AstroPay | Binance P2P | KORZAL |
|---------|----------|-------------|--------|
| Fee | 4-8% | 1-3% | < 0.5% |
| Custodia | Centralizada | Centralizada | Non-custodial |
| KYC | Obligatorio | Obligatorio | Opcional (<$500) |
| Velocidad | 1-24h | 15-60 min | < 2 min |
| Disponibilidad | Horario bancario | 24/7 | 24/7 |
| Transparencia | Opaca | Parcial | 100% on-chain |
| Países LATAM | 12 | 15 | Todos |

---

## 3. Servicios del Protocolo

### 3.1 Cambio Instantáneo (Core)
USDT → Moneda local via red P2P con escrow on-chain.

### 3.2 Pagos a Creadores
Creadores de contenido en LATAM pueden recibir pagos internacionales en USDT y convertirlos a moneda local sin necesidad de cuenta bancaria internacional.

### 3.3 Remesas
Envío de remesas entre países de LATAM con fee fijo de 0.3%, hasta 20x más barato que Western Union o MoneyGram.

### 3.4 Identidad Financiera Descentralizada (DID)
Sistema de reputación on-chain para proveedores de liquidez. Sin datos personales guardados en servidores centralizados.

### 3.5 Educación Financiera (Learn & Earn)
Usuarios ganan $KRZL completando módulos educativos sobre finanzas personales, cripto y uso del protocolo.

---

## 4. Tokenomics

### 4.1 Token Principal — $KRZL

```
Supply Total: 10,000,000 KRZL (fijo, no inflacionario)

Distribución:
├── 30% Liquidez inicial DEX (3,000,000 KRZL)
├── 25% Treasury del Proyecto (2,500,000 KRZL) *
├── 20% Comunidad / Ecosistema (2,000,000 KRZL)
├── 15% Equipo fundador (1,500,000 KRZL) **
├──  7% Advisors & Partnerships (700,000 KRZL)
└──  3% Reserve fondo legal (300,000 KRZL)

* Liberado por hitos (ver sección 4.3)
** Vesting 24 meses, cliff 6 meses
```

**Utilidad de $KRZL:**
- Pagar fees del protocolo con 50% de descuento
- Staking para convertirse en proveedor de liquidez
- Gobernanza: votar nuevos países, monedas y parámetros
- Acceso a tier premium de la aplicación
- Rewards por proveer liquidez

**Mecanismo deflacionario:**
- 20% de cada fee cobrado en $KRZL es quemado permanentemente
- A mayor volumen de transacciones → menor supply → precio sube

### 4.2 Memecoin Mascota — $BALAM (Jaguar Maya)

```
Supply Total: 10,000,000,000 BALAM (10 billones)

Distribución:
├── 60% Liquidez inicial DEX
├── 20% Airdrops comunidad
├── 10% Marketing y campañas virales
└── 10% Treasury KORZAL Protocol
```

**Relación con $KRZL:**
- $BALAM puede convertirse a $KRZL a tasa fija dentro del protocolo
- 1% de cada transacción $BALAM → treasury del proyecto
- Sin utilidad técnica (transparente y honesto con la comunidad)
- Es la puerta de entrada al ecosistema KORZAL

### 4.3 Vesting del Treasury por Hitos

```
Treasury: 2,500,000 KRZL (bloqueados en smart contract)

HITO 1 — MVP + 3 países operativos
  Libera: 500,000 KRZL (20%)
  Meta: App funcional en Colombia, Chile, México

HITO 2 — 10,000 usuarios activos
  Libera: 625,000 KRZL (25%)
  Meta: Volumen mensual > $500,000 USD

HITO 3 — 50,000 usuarios + 6 países
  Libera: 750,000 KRZL (30%)
  Meta: Expansión a Perú, Argentina, Venezuela, Brasil

HITO 4 — CEX Listing + 200,000 usuarios
  Libera: 625,000 KRZL (25%)
  Meta: Listing en exchange top 20

Mecanismo: multisig 3/5 entre equipo + advisors independientes
```

---

## 5. Arquitectura Técnica

### Blockchain: Solana
- Finality: < 400ms
- Fee por transacción: < $0.001
- TPS: 65,000+ (suficiente para escala LATAM)

### Smart Contracts
- Escrow P2P con timelock (30 min para confirmar o revertir)
- Mint de $KRZL con mint authority revocada post-launch
- Vesting contract para treasury y equipo
- Governance contract para votaciones on-chain

### Oráculos de Precio
- Pyth Network (nativo de Solana) para tipos de cambio en tiempo real
- Chainlink como backup

### Integraciones de Pago Local
```
Colombia:   Nequi, Bancolombia, Daviplata
Chile:      Mercado Pago, Fintoc, transferencia bancaria
México:     SPEI, Mercado Pago, CoDi
Perú:       Yape, Plin, BCP
Brasil:     PIX
Argentina:  Mercado Pago, transferencia bancaria
```

---

## 6. Roadmap

```
Q3 2025 — Fundación
  ✦ Constitución legal del proyecto
  ✦ Desarrollo de smart contracts
  ✦ Auditoría de seguridad
  ✦ Lanzamiento $BALAM (memecoin, comunidad)

Q4 2025 — MVP
  ✦ App beta (Colombia, Chile, México)
  ✦ Red de 50 proveedores de liquidez piloto
  ✦ Lanzamiento $KRZL en DEX (Raydium)
  ✦ Learn & Earn módulo 1

Q1 2026 — Crecimiento
  ✦ Expansión a Perú, Argentina
  ✦ 10,000 usuarios activos
  ✦ Integración con wallets principales
  ✦ App móvil iOS y Android

Q2 2026 — Escala
  ✦ Brasil y Venezuela
  ✦ 50,000 usuarios
  ✦ Módulo de remesas
  ✦ DID (identidad descentralizada)

Q3 2026 — Madurez
  ✦ CEX listing
  ✦ 200,000 usuarios
  ✦ Gobernanza completamente descentralizada
  ✦ Integración con bancos locales vía APIs
```

---

## 7. Modelo de Negocio

```
Ingresos del protocolo:
├── 0.3% fee por transacción de cambio
│     → 50% a proveedores de liquidez
│     → 30% al treasury
│     → 20% quemado ($KRZL deflacionario)
│
├── Tier Premium ($KRZL staking)
│     → Usuarios que stakean $KRZL pagan 0% fee
│     → KRZL bloqueado = menos supply circulante
│
└── Learn & Earn
      → Sponsors (bancos, fintechs) pagan para educar usuarios
```

**Proyección conservadora:**
- 10,000 usuarios × $500 promedio/mes = $5M volumen mensual
- Fee 0.3% = $15,000/mes al treasury en el Hito 2
- A escala (200k usuarios): $3M/mes de volumen → $9,000/día al treasury

---

## 8. Equipo

*(A completar con los integrantes del equipo)*

---

## 9. Legal

KORZAL Protocol opera como protocolo descentralizado. Los tokens $KRZL y $BALAM son tokens de utilidad y no representan valores (securities) ni participación en la empresa.

Los usuarios son responsables de cumplir con las regulaciones locales de su jurisdicción. El protocolo opera bajo el marco legal de DAO descentralizada.

Se recomienda consultar asesoría legal antes de participar en jurisdicciones con regulaciones específicas sobre criptomonedas.

---

## 10. Disclaimer

Este documento es informativo y está sujeto a cambios. No constituye asesoría financiera ni invitación a invertir. La inversión en criptomonedas implica riesgos significativos de pérdida de capital.

---

*KORZAL Protocol — Construido en Solana para América Latina*
*Versión 1.0 — 2025*
