export const chartOfAccounts = [
    ["1000", "Cash & Bank", "Asset"], ["1010", "HDFC Bank", "Bank"], ["1020", "Bank of Baroda", "Bank"], ["1100", "Digital Wallets", "Asset"],
    ["2000", "Credit Cards / Payables", "Liability"], ["3000", "Personal Capital", "Equity"], ["3010", "Personal Drawings", "Equity"],
    ["4000", "Income", "Income"], ["4010", "Salary", "Income"], ["4020", "Freelance / Consulting Income", "Income"], ["4030", "Interest Income", "Income"], ["4040", "Cashback & Rewards", "Income"],
    ["5000", "Meals & Entertainment", "Expense"], ["5010", "Groceries", "Expense"], ["5020", "Restaurants & Dining", "Expense"], ["5030", "Food Delivery", "Expense"], ["5040", "Snacks & Beverages", "Expense"], ["5050", "Tea / Coffee", "Expense"],
    ["5100", "Housing", "Expense"], ["5110", "Rent", "Expense"], ["5120", "Electricity", "Expense"], ["5130", "Water", "Expense"], ["5140", "Gas", "Expense"], ["5150", "Internet", "Expense"], ["5160", "Mobile / Telephone", "Expense"], ["5170", "Household Supplies", "Expense"],
    ["5200", "Transportation", "Expense"], ["5210", "Fuel / Petrol", "Expense"], ["5220", "Public Transport", "Expense"], ["5230", "Taxi / Cab", "Expense"], ["5240", "Parking & Tolls", "Expense"], ["5250", "Vehicle Maintenance", "Expense"], ["5260", "Vehicle Insurance", "Expense"],
    ["5300", "Personal Care", "Expense"], ["5310", "Haircut & Salon", "Expense"], ["5320", "Grooming", "Expense"], ["5330", "Clothing & Apparel", "Expense"], ["5340", "Shoes & Accessories", "Expense"],
    ["5400", "Entertainment", "Expense"], ["5410", "Movies & Events", "Expense"], ["5420", "Games", "Expense"], ["5430", "Music & Streaming", "Expense"], ["5440", "Subscriptions", "Expense"], ["5450", "Hobbies", "Expense"],
    ["5500", "Shopping", "Expense"], ["5510", "Electronics", "Expense"], ["5520", "Online Shopping", "Expense"], ["5530", "General Shopping", "Expense"], ["5540", "Gifts", "Expense"],
    ["5600", "Healthcare", "Expense"], ["5610", "Medical Expenses", "Expense"], ["5620", "Pharmacy / Medicines", "Expense"], ["5630", "Doctor / Consultation", "Expense"], ["5640", "Dental", "Expense"], ["5650", "Health Insurance", "Expense"],
    ["5700", "Education & Learning", "Expense"], ["5710", "Courses", "Expense"], ["5720", "Books & Learning Material", "Expense"], ["5730", "Software / Developer Tools", "Expense"], ["5740", "Professional Development", "Expense"],
    ["5800", "Travel", "Expense"], ["5810", "Flights", "Expense"], ["5820", "Hotels / Accommodation", "Expense"], ["5830", "Local Travel", "Expense"], ["5840", "Travel Food", "Expense"], ["5850", "Travel Activities", "Expense"],
    ["5900", "Financial Expenses", "Expense"], ["5910", "Bank Charges", "Expense"], ["5920", "ATM / Cash Withdrawal Charges", "Expense"], ["5930", "Interest Expense", "Expense"], ["5940", "Investment Fees", "Expense"],
    ["6000", "Insurance", "Expense"], ["6010", "Life Insurance", "Expense"], ["6020", "General Insurance", "Expense"], ["6100", "Charity & Donations", "Expense"], ["6200", "Taxes & Government", "Expense"], ["6210", "Income Tax", "Expense"], ["6220", "Government Fees", "Expense"], ["6300", "Miscellaneous Personal Expense", "Expense"], ["6310", "Uncategorized Expense", "Expense"],
    ["7000", "Transfer Between Own Accounts", "Transfer"], ["7010", "Cash Withdrawal", "Transfer"], ["7020", "Cash Deposit", "Transfer"], ["7030", "Credit Card Payment", "Transfer"], ["7100", "Investment Purchase", "Asset"], ["7110", "Investment Redemption", "Asset/Income"], ["7200", "Loan Received", "Liability"], ["7210", "Loan Repayment", "Liability"], ["7300", "Salary Received", "Income"], ["7310", "Refund Received", "Income/Adjustment"], ["7320", "Reimbursement Received", "Income/Adjustment"], ["8000", "Repair", "Expense"],
];

const isCatchAll = (account) => /^uncategori[sz]ed/i.test(account);

export const assignableAccounts = chartOfAccounts.filter(([, account]) => !isCatchAll(account));

// Only a blank account or the "Uncategorized" catch-all needs attention; any other head the sheet holds counts as categorised.
export const isUncategorized = (transaction) => {
	const account = String(transaction?.account ?? "").trim();
	return !account || isCatchAll(account);
};
