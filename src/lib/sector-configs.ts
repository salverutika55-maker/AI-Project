import { Sector } from "@prisma/client";

export const SECTOR_CONFIGS: Record<Sector, any> = {
  MANUFACTURING: {
    title: "Manufacturing",
    type: "manufacturing",
    sections: [
      {
        name: "Revenue from Operation",
        items: ["Domestic", "Export", "Less : Commission"],
      },
      {
        name: "Revenue Total",
        items: ["Total Revenue"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "Cost of Goods Sold",
        items: ["Opening Stock", "Purchase", "Transport on Purchases", "Closing Stock"],
      },
      {
        name: "COGS Total",
        items: ["COGS"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "Contribution Calculation",
        items: ["Contribution"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Direct Expenses",
        items: [
          "Coal Charges", "Power Bill", "Other Mfg. Expenses", 
          "Repairs & Maintenance - Factory", "Depreciation - Factory", 
          "Clearing & Forwarding Charges", "Consumables", "Factory Expenses", 
          "Security Charges", "Factory Staff", "Factory Workers", 
          "Hiring Charges", "Jobwork Charges", "Payment to Contractor", 
          "Transport on Sales"
        ]
      },
      {
        name: "Gross Profit Calculation",
        items: ["Gross Profit"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Indirect Income",
        items: ["Interest on Fixed Deposit", "Gain/ Loss on (Export/Import)", "Duty Drawback"]
      },
      {
        name: "Indirect Expenses",
        items: [
          "Administrative Expenses", "Sales & Advertisement Expenses", 
          "Director Remuneration", "Office Staff Salary", 
          "Repairs & Maintenance - Office", "Travelling Expenses", 
          "Legal & Professional Fees", "Rent Expenses", "Other Exp"
        ]
      },
      {
        name: "Total Indirect Expenses",
        items: ["Total Indirect Expenses"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "EBITDA Calculation",
        items: ["Earnings Before Interest Taxes & Amortization"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Financials",
        items: ["Interest Expense", "Depreciation"]
      },
      {
        name: "Final Result",
        items: ["Net Profit Before Tax"],
        isBold: true,
        isTotal: true,
        isCalculated: true,
      }
    ]
  },
  TRADING: {
    title: "Trading",
    type: "trading",
    sections: [
      {
        name: "Sales Income",
        items: ["Domestic", "Export", "Less : Commission"],
      },
      {
        name: "Revenue Total",
        items: ["Total Revenue"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "Trading Cost",
        items: ["Opening Stock", "Purchase", "Transport on Purchases", "Closing Stock"],
      },
      {
        name: "COGS Total",
        items: ["COGS"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "Contribution Calculation",
        items: ["Contribution"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Direct Expenses",
        items: ["Clearing & Forwarding Charges", "Transport on Sales", "Other Direct Expense"]
      },
      {
        name: "Gross Profit Calculation",
        items: ["Gross Profit"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Indirect Income",
        items: ["Interest on Fixed Deposit", "Gain/ Loss on (Export/Import)", "Duty Drawback"]
      },
      {
        name: "Indirect Expenses",
        items: [
          "Administrative Expenses", "Sales & Advertisement Expenses", 
          "Director Remuneration", "Office Staff Salary", 
          "Repairs & Maintenance - Office", "Travelling Expenses", 
          "Legal & Professional Fees", "Rent Expenses", "Other Exp"
        ]
      },
      {
        name: "Total Indirect Expenses",
        items: ["Total Indirect Expenses"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "EBITDA Calculation",
        items: ["Earnings Before Interest Taxes & Amortization"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Financials",
        items: ["Interest Expense", "Depreciation"]
      },
      {
        name: "Final Result",
        items: ["Net Profit Before Tax"],
        isBold: true,
        isTotal: true,
        isCalculated: true,
      }
    ]
  },
  SERVICE: {
    title: "Service",
    type: "service",
    sections: [
      {
        name: "Operating Revenue",
        items: [
          "Service Revenue (Primary income)", "Consulting / Professional Fees", 
          "Maintenance / AMC Income", "Commission Income", "Other Operating Income"
        ],
      },
      {
        name: "Revenue Deductions",
        items: ["Less : Commission"],
      },
      {
        name: "Net Revenue",
        items: ["Total Revenue"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "Service Delivery Costs (Direct)",
        items: [
          "Salaries - Service Staff / Engineers / Consultants", "Freelance / Contract Charges", 
          "Project Expenses", "Travel & Conveyance (Service-related)", 
          "Consumables / Tools Used", "Site Expenses", "Subcontracting Charges", 
          "Other Direct Expense"
        ]
      },
      {
        name: "Gross Profit Calculation",
        items: ["Gross Profit"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Indirect Income",
        items: ["Interest on Fixed Deposit"]
      },
      {
        name: "Administrative & General Expenses",
        items: [
          "Administrative Expenses", "Sales & Advertisement Expenses", 
          "Director Remuneration", "Office Staff Salary", 
          "Repairs & Maintenance - Office", "Travelling Expenses", 
          "Legal & Professional Fees", "Other Exp"
        ]
      },
      {
        name: "Total Indirect Expenses",
        items: ["Total Indirect Expenses"],
        isBold: true,
        isCalculated: true,
      },
      {
        name: "EBITDA Calculation",
        items: ["Earnings Before Interest Taxes & Amortization"],
        isBold: true,
        isSubtotal: true,
        isCalculated: true,
      },
      {
        name: "Financials",
        items: ["Interest Expense", "Depreciation"]
      },
      {
        name: "Final Result",
        items: ["Net Profit Before Tax"],
        isBold: true,
        isTotal: true,
        isCalculated: true,
      }
    ]
  }
};
