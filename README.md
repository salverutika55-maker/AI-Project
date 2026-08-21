# FinAnalyzer — Financial Analytics & Audit Intelligence Platform

FinAnalyzer is an enterprise-grade financial analytics, business intelligence, and audit working paper platform designed for Chartered Accountants, forensic auditors, and corporate finance teams. It integrates directly with major ERP and accounting software to deliver real-time financial reporting, compliance auditing, and strategic advisory.

---

## 🚀 Key Modules & Capabilities

### 1. Executive Dashboard & KPI Engine
- Real-time tracking of critical financial performance indicators.
- Live analysis of profitability, liquidity, and operational metrics.
- Sub-module analysis highlighting top vendors and customers by transaction volume.

### 2. Audit Working Papers & Ledger Scrutiny
- Automated scrutiny of client general ledgers against customized audit rules.
- Complete transparency: displays every check performed (e.g., TDS rate checks, depreciation, prepaid expense amortizations) along with its pass/fail status and supporting transactions.
- Zero boilerplate: displays detailed audit outcomes for each scrutinised ledger.

### 3. Provision Accounting (Double-Entry Engine)
- Record provisions using real accounting double-entry patterns.
- Automated generation of voucher reference numbers.
- Integrated workflow: provisions automatically impact the Profit & Loss statement and Balance Sheet.
- Manual reversal controls with authorization audits.

### 4. Chart Explorer & COA Mapping
- Interactive hierarchical explorer of the Chart of Accounts.
- Standardize and map client-specific ledger accounts to standard platform reporting heads.
- Real-time preview of balances mapped to standard heads.

### 5. Dynamic Financial Statements
- **Profit & Loss Account**: Multi-month dynamic rendering with customizable structures.
- **Balance Sheet**: dynamic asset, liability, and equity grouping with automated **Opening Balance Discrepancy Auditing** comparing current opening balances against prior closing balances.

### 6. Risk Intelligence & Early Warning System
- Real-time compliance alerts (TDS defaults, GST mismatches).
- Anomaly detection for unusual ledger movements and transactional risks.

---

## 🔌 ERP & Accounting Connectors

FinAnalyzer supports automated data syncing and schema normalization across:
- **Tally Prime** (via XML trial balance/voucher imports)
- **Zoho Books** (via OAuth API integration)
- **QuickBooks Online** (via OAuth API integration)
- **Xero** (via API integration)
- **Odoo** (via integration)
- **SAP S/4HANA** (via data integration)

---

## 🔒 Security & Multi-Tenant RBAC

FinAnalyzer enforces strict organization-level data isolation:
- **Global Administrator** (`ADMIN`): Platform-level oversight and diagnostic logs.
- **Organization Roles**:
  - `SUPER_ADMIN`: Full organization access, billing, and membership approvals.
  - `ORG_ADMIN`: Team management, client creator, and access reviews.
  - `FINANCE_MANAGER`: Manage provisions, ledger mapping, and view reports.
  - `ACCOUNTANT`: Edit records, record journals, and upload data.
  - `STAFF`: Upload trial balances, view dashboards.
  - `READ_ONLY`: View reports and dashboards only.
- **Defensive Authentication**: Built on NextAuth.js with multi-admin access approval (OR-approval model) and secure credential validation.

---

## 🛠️ Getting Started

### 1. Prerequisites
- Node.js (v18 or higher)
- PostgreSQL database instance

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://<username>:<password>@<host>:<port>/<db_name>?pgbouncer=true"
DIRECT_URL="postgresql://<username>:<password>@<host>:<port>/<db_name>"

NEXTAUTH_SECRET="your_nextauth_secret_key"
NEXTAUTH_URL="http://localhost:3000"

# ERP Credentials
QUICKBOOKS_CLIENT_ID=your_id
QUICKBOOKS_CLIENT_SECRET=your_secret
ZOHO_CLIENT_ID=your_id
ZOHO_CLIENT_SECRET=your_secret
```

### 3. Database Synchronization
Run the following commands to sync the database schema and generate the Prisma Client:
```bash
npx prisma db push
```

### 4. Running the Development Server
```bash
npm run dev
# or
yarn dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to view the application.
