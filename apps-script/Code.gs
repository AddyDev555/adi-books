/**
 * ============================================================
 * HDFC BANK → GOOGLE SHEETS TRANSACTION SYNC + DASHBOARD API
 * ============================================================
 *
 * Gmail
 *   ↓
 * Google Apps Script
 *   ↓
 * Historical Rules
 *   ↓
 * NVIDIA NIM fallback
 *   ↓
 * Google Sheet
 *   ↓
 * Web App API (doGet = read, doPost = update / delete)
 *
 * Categorisation priority:
 *
 * 1. Historical Rules
 *    - Supplier + Transaction Description
 *    - Case-insensitive
 *    - Whole-word regex matching
 *
 * 2. NVIDIA Nemotron Nano fallback
 *    - Used only when Historical Rules do not match
 *    - Receives Chart of Accounts
 *    - Returns one valid Account Head
 *
 * Duplicate checking:
 *    - ONLY against Transactions sheet
 *
 * Transactions columns:
 *
 * A Date
 * B Transaction Line Description
 * C Credit Amount
 * D Debit Amount
 * E Account
 * F Bank Name
 * G Supplier
 * H Note
 * I Source
 *
 * Source values:
 *
 * Historical Rules
 * LLM
 * Unclassified
 * Manual          (edited from the dashboard)
 *
 * ------------------------------------------------------------
 * NVIDIA API KEY
 * ------------------------------------------------------------
 *
 * The key is NOT stored in code. Set it once:
 *
 * Project Settings (gear icon) > Script Properties >
 * Add script property:
 *
 *   Property: NVIDIA_API_KEY
 *   Value:    nvapi-...your rotated key...
 *
 * ============================================================
 */


const CONFIG = {

  SENDER:
    "alerts@hdfcbank.bank.in",

  SPREADSHEET_ID:
    "1epdJBwm7FA_hYL1-VZX5sKwiZpvG704MsO7J1tQg6Jg",

  SHEET_NAME:
    "Transactions",

  HISTORICAL_RULES_SHEET:
    "Historical Rules",

  CHART_OF_ACCOUNTS_SHEET:
    "Chart of Accounts",

  TIMEZONE:
    "Asia/Kolkata",

  SEARCH_DAYS:
    2,


  /**
   * ==========================================================
   * NVIDIA NIM
   * ==========================================================
   *
   * API key is read from Script Properties (NVIDIA_API_KEY).
   */

  NVIDIA_MODEL:
    "nvidia/nemotron-3.5-lightning-30b-a3b",

  NVIDIA_API_URL:
    "https://integrate.api.nvidia.com/v1/chat/completions",


  /**
   * ==========================================================
   * DASHBOARD EDITS
   * ==========================================================
   */

  MANUAL_SOURCE:
    "Manual"

};


/**
 * API field -> 1-based Transactions column.
 */

const TRANSACTION_COLUMNS = {

  date: 1,

  transactionLineDescription: 2,

  creditAmount: 3,

  debitAmount: 4,

  account: 5,

  bankName: 6,

  supplier: 7,

  note: 8,

  source: 9

};


/**
 * ============================================================
 * NVIDIA API KEY (SCRIPT PROPERTIES)
 * ============================================================
 */

function getNvidiaApiKey() {

  return String(
    PropertiesService
      .getScriptProperties()
      .getProperty(
        "NVIDIA_API_KEY"
      ) || ""
  ).trim();
}


/**
 * ============================================================
 * MAIN DAILY JOB
 * ============================================================
 */

function syncHdfcTransactions() {

  console.log("=================================");
  console.log("HDFC DAILY TRANSACTION SYNC");
  console.log("Started: " + new Date());
  console.log("=================================");


  /**
   * Same lock as doPost, so a dashboard edit/delete can't
   * shift rows while the sync is appending.
   */

  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    30000
  );


  try {

    initializeTransactionSheet();

    const transactions =
      getHdfcTransactions();


    console.log(
      "New transactions found: " +
      transactions.length
    );


    if (transactions.length === 0) {

      console.log(
        "No new HDFC transactions found."
      );

      return;
    }


    saveTransactionsToSheet(
      transactions
    );


    console.log(
      "Successfully saved " +
      transactions.length +
      " transaction(s)."
    );

  } catch (error) {

    console.error(
      "HDFC SYNC FAILED"
    );

    console.error(
      error.message
    );

    throw error;

  } finally {

    lock.releaseLock();
  }


  console.log("=================================");
  console.log("HDFC SYNC COMPLETED");
  console.log("=================================");
}


/**
 * ============================================================
 * INITIALIZE TRANSACTION SHEET
 * ============================================================
 */

function initializeTransactionSheet() {

  if (
    !CONFIG.SPREADSHEET_ID ||
    String(CONFIG.SPREADSHEET_ID).trim() === ""
  ) {

    throw new Error(
      "Please set CONFIG.SPREADSHEET_ID before running the script."
    );
  }


  const spreadsheet =
    SpreadsheetApp.openById(
      CONFIG.SPREADSHEET_ID
    );


  let sheet =
    spreadsheet.getSheetByName(
      CONFIG.SHEET_NAME
    );


  if (!sheet) {

    sheet =
      spreadsheet.insertSheet(
        CONFIG.SHEET_NAME
      );
  }


  /**
   * A = Date
   * B = Transaction Line Description
   * C = Credit Amount
   * D = Debit Amount
   * E = Account
   * F = Bank Name
   * G = Supplier
   * H = Note
   * I = Source
   */

  const headers = [

    "Date",

    "Transaction Line Description",

    "Credit Amount",

    "Debit Amount",

    "Account",

    "Bank Name",

    "Supplier",

    "Note",

    "Source"

  ];


  /**
   * Make sure the sheet has enough columns.
   */

  const maxColumns =
    sheet.getMaxColumns();


  if (
    maxColumns < headers.length
  ) {

    sheet.insertColumnsAfter(
      maxColumns,
      headers.length - maxColumns
    );
  }


  /**
   * Write / repair headers A1:I1.
   * Existing transaction rows are NOT modified.
   */

  const headerRange =
    sheet.getRange(
      1,
      1,
      1,
      headers.length
    );


  headerRange.setValues([
    headers
  ]);


  headerRange.setFontWeight(
    "bold"
  );


  sheet.setFrozenRows(1);


  console.log(
    "Transactions sheet initialized successfully."
  );
}


/**
 * ============================================================
 * GET HDFC TRANSACTIONS
 * ============================================================
 */

function getHdfcTransactions() {

  const query =
    `from:${CONFIG.SENDER} newer_than:${CONFIG.SEARCH_DAYS}d`;


  console.log(
    "Gmail query: " +
    query
  );


  const threads =
    GmailApp.search(
      query
    );


  console.log(
    "Threads found: " +
    threads.length
  );


  const existingTransactions =
    getExistingSheetTransactions();


  console.log(
    "Existing transactions in sheet: " +
    existingTransactions.size
  );


  /**
   * Load Historical Rules ONCE.
   */

  const historicalRules =
    getHistoricalRules();


  console.log(
    "Historical Rules loaded: " +
    historicalRules.length
  );


  /**
   * Load Chart of Accounts ONCE.
   */

  const chartOfAccounts =
    getChartOfAccounts();


  console.log(
    "Chart of Accounts loaded: " +
    chartOfAccounts.length
  );


  const transactions = [];


  for (
    const thread of threads
  ) {

    const messages =
      thread.getMessages();


    console.log(
      "Thread contains " +
      messages.length +
      " message(s)"
    );


    for (
      const message of messages
    ) {

      const messageId =
        message.getId();

      const sender =
        message.getFrom();

      const subject =
        message.getSubject();

      const emailDate =
        message.getDate();

      const body =
        message.getPlainBody();


      console.log("---------------------------------");

      console.log(
        "Message ID: " +
        messageId
      );

      console.log(
        "Subject: " +
        subject
      );


      /**
       * Sender validation.
       */

      if (
        !sender ||
        !sender
          .toLowerCase()
          .includes(
            CONFIG.SENDER.toLowerCase()
          )
      ) {

        console.log(
          "Skipping: sender mismatch"
        );

        continue;
      }


      /**
       * Empty body check.
       */

      if (!body) {

        console.log(
          "Skipping: empty email body"
        );

        continue;
      }


      /**
       * Parse transaction.
       */

      const transaction =
        parseHdfcTransaction(
          body,
          subject,
          emailDate,
          messageId
        );


      if (!transaction) {

        console.log(
          "Skipping: not a transaction email"
        );

        continue;
      }


      /**
       * Create fingerprint.
       */

      const transactionKey =
        createTransactionKey(
          transaction
        );


      /**
       * Check Google Sheet.
       */

      if (
        existingTransactions.has(
          transactionKey
        )
      ) {

        console.log(
          "Skipping: transaction already exists in Google Sheet."
        );

        continue;
      }


      /**
       * Prevent duplicate transactions within current sync.
       */

      if (
        transactions.some(
          function(existingTransaction) {

            return (
              createTransactionKey(
                existingTransaction
              ) === transactionKey
            );

          }
        )
      ) {

        console.log(
          "Skipping: duplicate transaction found in current sync."
        );

        continue;
      }


      /**
       * Account categorisation.
       */

      const categorisation =
        categoriseTransaction(
          transaction,
          historicalRules,
          chartOfAccounts
        );


      transaction["Account"] =
        categorisation.account;


      transaction["_categorisationSource"] =
        categorisation.source;


      console.log(
        "Account: " +
        (
          categorisation.account ||
          "NOT FOUND"
        )
      );


      console.log(
        "Categorisation Source: " +
        categorisation.source
      );


      transactions.push(
        transaction
      );


      console.log(
        "Transaction parsed and accepted."
      );

    }
  }


  console.log(
    "Total new transactions: " +
    transactions.length
  );


  return transactions;
}


/**
 * ============================================================
 * CATEGORISE TRANSACTION
 * ============================================================
 *
 * 1. Historical Rules
 * 2. NVIDIA NIM
 * 3. Blank (Unclassified)
 *
 * ============================================================
 */

function categoriseTransaction(
  transaction,
  historicalRules,
  chartOfAccounts
) {

  /**
   * STEP 1 - Historical Rules
   */

  const historicalAccount =
    findHistoricalAccount(
      transaction,
      historicalRules
    );


  if (historicalAccount) {

    console.log(
      "Historical Rule matched: " +
      historicalAccount
    );


    return {

      account:
        historicalAccount,

      source:
        "Historical Rules"

    };
  }


  /**
   * STEP 2 - NVIDIA NIM / LLM
   */

  console.log(
    "No Historical Rule matched."
  );

  console.log(
    "Sending transaction to NVIDIA NIM..."
  );


  try {

    const aiAccount =
      classifyWithNvidia(
        transaction,
        chartOfAccounts
      );


    if (aiAccount) {

      return {

        account:
          aiAccount,

        source:
          "LLM"

      };
    }


  } catch (error) {

    console.error(
      "NVIDIA categorisation failed:"
    );

    console.error(
      error.message
    );
  }


  /**
   * STEP 3 - No account found
   */

  return {

    account:
      "",

    source:
      "Unclassified"

  };
}


/**
 * ============================================================
 * HISTORICAL RULES
 * ============================================================
 */

function getHistoricalRules() {

  const spreadsheet =
    SpreadsheetApp.openById(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    spreadsheet.getSheetByName(
      CONFIG.HISTORICAL_RULES_SHEET
    );


  if (!sheet) {

    console.log(
      "Historical Rules sheet not found."
    );

    return [];
  }


  const lastRow =
    sheet.getLastRow();


  if (lastRow <= 1) {

    return [];
  }


  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        3
      )
      .getValues();


  const rules = [];


  for (
    const row of data
  ) {

    const description =
      String(
        row[0] || ""
      ).trim();


    const supplier =
      String(
        row[1] || ""
      ).trim();


    const account =
      String(
        row[2] || ""
      ).trim();


    if (
      !description ||
      !supplier ||
      !account
    ) {

      continue;
    }


    rules.push({

      description:
        description,

      supplier:
        supplier,

      account:
        account

    });
  }


  return rules;
}


/**
 * ============================================================
 * FIND HISTORICAL ACCOUNT
 * ============================================================
 */

function findHistoricalAccount(
  transaction,
  historicalRules
) {

  const transactionDescription =
    String(
      transaction[
        "Transaction Line Description"
      ] || ""
    );


  const transactionSupplier =
    String(
      transaction[
        "Supplier"
      ] || ""
    );


  if (
    !transactionDescription ||
    !transactionSupplier
  ) {

    return "";
  }


  for (
    const rule of historicalRules
  ) {

    const supplierMatches =
      wholeWordRegexMatch(
        transactionSupplier,
        rule.supplier
      );


    if (!supplierMatches) {

      continue;
    }


    const descriptionMatches =
      wholeWordRegexMatch(
        transactionDescription,
        rule.description
      );


    if (!descriptionMatches) {

      continue;
    }


    console.log(
      "Historical Rule Match:"
    );

    console.log(
      "Supplier: " +
      rule.supplier
    );

    console.log(
      "Description: " +
      rule.description
    );

    console.log(
      "Account: " +
      rule.account
    );


    return rule.account;
  }


  return "";
}


/**
 * ============================================================
 * WHOLE-WORD REGEX MATCH
 * ============================================================
 */

function wholeWordRegexMatch(
  text,
  rule
) {

  if (
    !text ||
    !rule
  ) {

    return false;
  }


  const escapedRule =
    escapeRegex(
      String(rule)
    );


  const pattern =
    "(?<!\\w)" +
    escapedRule +
    "(?!\\w)";


  try {

    return new RegExp(
      pattern,
      "i"
    ).test(
      String(text)
    );

  } catch (error) {

    const fallbackPattern =
      "\\b" +
      escapedRule +
      "\\b";


    return new RegExp(
      fallbackPattern,
      "i"
    ).test(
      String(text)
    );
  }
}


/**
 * ============================================================
 * ESCAPE REGEX
 * ============================================================
 */

function escapeRegex(
  value
) {

  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}


/**
 * ============================================================
 * CHART OF ACCOUNTS
 * ============================================================
 */

function getChartOfAccounts() {

  const spreadsheet =
    SpreadsheetApp.openById(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    spreadsheet.getSheetByName(
      CONFIG.CHART_OF_ACCOUNTS_SHEET
    );


  if (!sheet) {

    throw new Error(
      "Chart of Accounts sheet not found."
    );
  }


  const lastRow =
    sheet.getLastRow();


  if (lastRow <= 1) {

    return [];
  }


  const lastColumn =
    sheet.getLastColumn();


  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];


  const codeIndex =
    findHeaderIndex(
      headers,
      [
        "Code"
      ]
    );


  const accountIndex =
    findHeaderIndex(
      headers,
      [
        "Account Head",
        "Account"
      ]
    );


  const typeIndex =
    findHeaderIndex(
      headers,
      [
        "Type"
      ]
    );


  if (
    accountIndex === -1
  ) {

    throw new Error(
      "Chart of Accounts must contain an 'Account Head' column."
    );
  }


  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        lastColumn
      )
      .getValues();


  const accounts = [];


  for (
    const row of data
  ) {

    const code =
      codeIndex >= 0
        ? String(
          row[codeIndex] || ""
        ).trim()
        : "";


    const accountHead =
      String(
        row[accountIndex] || ""
      ).trim();


    const type =
      typeIndex >= 0
        ? String(
          row[typeIndex] || ""
        ).trim()
        : "";


    if (!accountHead) {

      continue;
    }


    accounts.push({

      code:
        code,

      accountHead:
        accountHead,

      type:
        type

    });
  }


  return accounts;
}


/**
 * ============================================================
 * FIND HEADER INDEX
 * ============================================================
 */

function findHeaderIndex(
  headers,
  possibleNames
) {

  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    const header =
      String(
        headers[i] || ""
      )
        .trim()
        .toLowerCase();


    for (
      const possibleName of possibleNames
    ) {

      if (
        header ===
        String(
          possibleName
        )
          .trim()
          .toLowerCase()
      ) {

        return i;
      }
    }
  }


  return -1;
}


/**
 * ============================================================
 * NVIDIA NIM CLASSIFICATION
 * ============================================================
 */

function classifyWithNvidia(
  transaction,
  chartOfAccounts
) {

  const apiKey =
    getNvidiaApiKey();


  if (!apiKey) {

    throw new Error(
      "NVIDIA_API_KEY is not set in Script Properties."
    );
  }


  if (
    !chartOfAccounts ||
    chartOfAccounts.length === 0
  ) {

    throw new Error(
      "Chart of Accounts is empty."
    );
  }


  /**
   * Compact Chart of Accounts.
   */

  const accountList =
    chartOfAccounts.map(
      function(account) {

        return {

          code:
            account.code,

          account:
            account.accountHead,

          type:
            account.type

        };

      }
    );


  const systemPrompt = `You are a PERSONAL FINANCE TRANSACTION CATEGORISATION ENGINE.

Your job is to classify exactly ONE personal bank transaction.

STRICT RULES:

1. Use ONLY the supplied Chart of Accounts.
2. Select exactly ONE Account Head.
3. The Account Head MUST already exist in the supplied Chart of Accounts.
4. NEVER invent an account.
5. NEVER rename an account.
6. NEVER create a new account.
7. Consider both Supplier and Transaction Description.
8. Consider transaction type and amount.
9. If a payment is made to another person and it is not a transfer between the user's own accounts, do NOT select Transfer Between Own Accounts.
10. If a personal payment to another person cannot be identified more specifically, use Miscellaneous Personal Expense if it exists.
11. Do NOT use Personal Drawings for ordinary personal spending.
12. Return ONLY a JSON object.
13. Do NOT provide reasoning.
14. Do NOT provide an explanation.
15. Do NOT use markdown.
16. Do NOT output anything except the JSON object.

CHART OF ACCOUNTS:

${JSON.stringify(accountList, null, 2)}

REQUIRED OUTPUT:

{"account":"EXACT ACCOUNT HEAD FROM CHART OF ACCOUNTS"}`;


  const userPrompt = `Categorise this PERSONAL bank transaction.

Date:
${transaction["Date"]}

Transaction Description:
${transaction["Transaction Line Description"]}

Supplier:
${transaction["Supplier"]}

Debit Amount:
${transaction["Debit Amount"]}

Credit Amount:
${transaction["Credit Amount"]}

Bank:
${transaction["Bank Name"]}

Note:
${transaction["Note"]}

Return ONLY this format:

{"account":"EXACT ACCOUNT HEAD"}

No reasoning.
No explanation.
No markdown.`;


  /**
   * NVIDIA NIM payload. Reasoning is explicitly disabled.
   */

  const payload = {

    model:
      CONFIG.NVIDIA_MODEL,

    messages: [

      {
        role:
          "system",

        content:
          systemPrompt
      },

      {
        role:
          "user",

        content:
          userPrompt
      }

    ],

    temperature:
      0.1,

    max_tokens:
      80,

    seed:
      42,

    stream:
      false,

    chat_template_kwargs: {

      enable_thinking:
        false

    }

  };


  const response =
    UrlFetchApp.fetch(
      CONFIG.NVIDIA_API_URL,
      {

        method:
          "post",

        contentType:
          "application/json",

        headers: {

          Authorization:
            "Bearer " +
            apiKey,

          Accept:
            "application/json"

        },

        payload:
          JSON.stringify(
            payload
          ),

        muteHttpExceptions:
          true

      }
    );


  const statusCode =
    response.getResponseCode();


  const responseText =
    response.getContentText();


  console.log(
    "NVIDIA HTTP Status: " +
    statusCode
  );


  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {

    throw new Error(
      "NVIDIA API error " +
      statusCode +
      ": " +
      responseText
    );
  }


  let responseJson;


  try {

    responseJson =
      JSON.parse(
        responseText
      );

  } catch (error) {

    throw new Error(
      "NVIDIA returned invalid JSON response: " +
      responseText
    );
  }


  const content =
    responseJson &&
    responseJson.choices &&
    responseJson.choices[0] &&
    responseJson.choices[0].message &&
    responseJson.choices[0].message.content;


  if (!content) {

    throw new Error(
      "NVIDIA API returned no model content."
    );
  }


  console.log(
    "NVIDIA raw response:"
  );

  console.log(
    content
  );


  const predictedAccount =
    extractNvidiaAccount(
      content,
      chartOfAccounts
    );


  if (!predictedAccount) {

    throw new Error(
      "NVIDIA could not determine a valid Account Head."
    );
  }


  console.log(
    "NVIDIA selected Account: " +
    predictedAccount
  );


  return predictedAccount;
}


/**
 * ============================================================
 * EXTRACT NVIDIA ACCOUNT
 * ============================================================
 */

function extractNvidiaAccount(
  content,
  chartOfAccounts
) {

  if (
    !content ||
    !chartOfAccounts ||
    chartOfAccounts.length === 0
  ) {

    return "";
  }


  const text =
    String(content)
      .trim();


  /**
   * STEP 1 - Try JSON parser.
   */

  try {

    const parsed =
      parseNvidiaJson(
        text
      );


    if (
      parsed &&
      parsed.account
    ) {

      const exactAccount =
        findExactAccountInChart(
          parsed.account,
          chartOfAccounts
        );


      if (exactAccount) {

        return exactAccount;
      }
    }

  } catch (error) {

    console.log(
      "Direct NVIDIA JSON parsing failed."
    );
  }


  /**
   * STEP 2 - Search model response for an exact Account Head.
   */

  const sortedAccounts =
    chartOfAccounts
      .slice()
      .sort(
        function(a, b) {

          return (
            String(b.accountHead).length -
            String(a.accountHead).length
          );

        }
      );


  for (
    const account of sortedAccounts
  ) {

    const accountHead =
      String(
        account.accountHead || ""
      ).trim();


    if (!accountHead) {

      continue;
    }


    if (
      wholeWordRegexMatch(
        text,
        accountHead
      )
    ) {

      console.log(
        "Extracted Account Head from NVIDIA prose: " +
        accountHead
      );


      return accountHead;
    }
  }


  /**
   * STEP 3 - Look for quoted account values.
   */

  const quotedPatterns = [

    /"account"\s*:\s*"([^"]+)"/i,

    /account\s*[:=]\s*"([^"]+)"/i,

    /account\s*[:=]\s*'([^']+)'/i,

    /account\s+is\s+["']([^"']+)["']/i

  ];


  for (
    const pattern of quotedPatterns
  ) {

    const match =
      text.match(
        pattern
      );


    if (!match) {

      continue;
    }


    const exactAccount =
      findExactAccountInChart(
        match[1],
        chartOfAccounts
      );


    if (exactAccount) {

      return exactAccount;
    }
  }


  return "";
}


/**
 * ============================================================
 * PARSE NVIDIA JSON
 * ============================================================
 */

function parseNvidiaJson(
  content
) {

  let cleaned =
    String(content)
      .trim();


  /**
   * Remove markdown fences.
   */

  cleaned =
    cleaned
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();


  /**
   * Direct JSON.
   */

  try {

    return JSON.parse(
      cleaned
    );

  } catch (error) {

    /**
     * Continue to embedded JSON.
     */
  }


  /**
   * Find first JSON object.
   */

  const startIndex =
    cleaned.indexOf(
      "{"
    );


  const endIndex =
    cleaned.lastIndexOf(
      "}"
    );


  if (
    startIndex === -1 ||
    endIndex === -1 ||
    endIndex <= startIndex
  ) {

    throw new Error(
      "Could not find JSON object in NVIDIA response: " +
      cleaned
    );
  }


  const jsonText =
    cleaned.substring(
      startIndex,
      endIndex + 1
    );


  return JSON.parse(
    jsonText
  );
}


/**
 * ============================================================
 * VALIDATE ACCOUNT AGAINST CHART
 * ============================================================
 */

function findExactAccountInChart(
  predictedAccount,
  chartOfAccounts
) {

  if (
    predictedAccount === null ||
    predictedAccount === undefined
  ) {

    return "";
  }


  const normalizedPrediction =
    String(
      predictedAccount
    )
      .trim()
      .replace(
        /\s+/g,
        " "
      )
      .toLowerCase();


  if (!normalizedPrediction) {

    return "";
  }


  for (
    const account of chartOfAccounts
  ) {

    const normalizedAccount =
      String(
        account.accountHead
      )
        .trim()
        .replace(
          /\s+/g,
          " "
        )
        .toLowerCase();


    if (
      normalizedAccount ===
      normalizedPrediction
    ) {

      return account.accountHead;
    }
  }


  return "";
}


/**
 * ============================================================
 * READ EXISTING TRANSACTIONS
 * ============================================================
 */

function getExistingSheetTransactions() {

  const spreadsheet =
    SpreadsheetApp.openById(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    spreadsheet.getSheetByName(
      CONFIG.SHEET_NAME
    );


  if (!sheet) {

    throw new Error(
      "Transactions sheet does not exist."
    );
  }


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow <= 1
  ) {

    return new Set();
  }


  /**
   * Read only the original transaction fields.
   * Account and Source are NOT part of the duplicate key,
   * so editing them from the dashboard never causes re-imports.
   */

  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        8
      )
      .getValues();


  const existingTransactions =
    new Set();


  for (
    const row of data
  ) {

    if (
      row.every(
        function(value) {

          return (
            value === "" ||
            value === null
          );

        }
      )
    ) {

      continue;
    }


    existingTransactions.add(
      createSheetTransactionKey(
        row
      )
    );
  }


  return existingTransactions;
}


/**
 * ============================================================
 * CREATE TRANSACTION KEY
 * ============================================================
 */

function createTransactionKey(
  transaction
) {

  return createNormalizedKey([

    transaction["Date"],

    transaction[
      "Transaction Line Description"
    ],

    transaction[
      "Credit Amount"
    ],

    transaction[
      "Debit Amount"
    ],

    transaction["Bank Name"],

    transaction["Supplier"],

    transaction["Note"]

  ]);
}


/**
 * ============================================================
 * CREATE SHEET TRANSACTION KEY
 * ============================================================
 */

function createSheetTransactionKey(
  row
) {

  return createNormalizedKey([

    row[0],

    row[1],

    row[2],

    row[3],

    row[5],

    row[6],

    row[7]

  ]);
}


/**
 * ============================================================
 * NORMALIZED TRANSACTION KEY
 * ============================================================
 */

function createNormalizedKey(
  values
) {

  return values
    .map(
      function(value) {

        if (
          value instanceof Date
        ) {

          return Utilities.formatDate(
            value,
            CONFIG.TIMEZONE,
            "yyyy-MM-dd"
          );
        }


        if (
          value === null ||
          value === undefined
        ) {

          return "";
        }


        return String(value)
          .trim()
          .replace(
            /\s+/g,
            " "
          )
          .toLowerCase();

      }
    )
    .join("||");
}


/**
 * ============================================================
 * HDFC TRANSACTION PARSER
 * ============================================================
 */

function parseHdfcTransaction(
  body,
  subject,
  emailDate,
  messageId
) {

  if (
    body === undefined ||
    body === null ||
    body === ""
  ) {

    return null;
  }


  const text =
    normalizeText(
      body
    );


  if (!text) {

    return null;
  }


  const transaction =
    parseHdfcUpiEmail(
      text,
      emailDate,
      messageId
    );


  if (transaction) {

    return transaction;
  }


  return parseGeneralHdfcTransaction(
    text,
    subject,
    emailDate,
    messageId
  );
}


/**
 * ============================================================
 * HDFC UPI PARSER
 * ============================================================
 */

function parseHdfcUpiEmail(
  body,
  emailDate,
  messageId
) {

  const text =
    String(body || "")
      .replace(
        /\r/g,
        ""
      )
      .replace(
        /\n+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  const transactionRegex =
    /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+is\s+(debited|credited)\s+from\s+your\s+account\s+ending\s+(\d{4})\s+towards\s+VPA\s+(.+?)\s+on\s+(\d{2}-\d{2}-\d{2})\./i;


  const match =
    text.match(
      transactionRegex
    );


  if (!match) {

    return null;
  }


  const amount =
    parseFloat(
      match[1]
        .replace(
          /,/g,
          ""
        )
    );


  const type =
    match[2].toLowerCase();


  const description =
    match[4].trim();


  const transactionDate =
    convertHdfcDate(
      match[5]
    );


  let supplier = "";


  const supplierMatch =
    description.match(
      /\(([^)]+)\)/
    );


  if (supplierMatch) {

    supplier =
      supplierMatch[1].trim();
  }


  let note = "";


  const referenceMatch =
    text.match(
      /UPI transaction reference no\.?:\s*([0-9]+)/i
    );


  if (referenceMatch) {

    note =
      "UPI transaction reference no.: " +
      referenceMatch[1];
  }


  return {

    "Date":
      transactionDate,

    "Transaction Line Description":
      description,

    "Credit Amount":
      type === "credited"
        ? amount
        : 0,

    "Debit Amount":
      type === "debited"
        ? amount
        : 0,

    "Account":
      "",

    "Bank Name":
      "HDFC Bank",

    "Supplier":
      supplier,

    "Note":
      note,

    "_source":
      "HDFC_BANK",

    "_sourceMessageId":
      messageId

  };
}


/**
 * ============================================================
 * GENERAL HDFC FALLBACK PARSER
 * ============================================================
 */

function parseGeneralHdfcTransaction(
  text,
  subject,
  emailDate,
  messageId
) {

  const isDebit =
    /\b(debited|debit|spent|withdrawn|paid)\b/i
      .test(text);


  const isCredit =
    /\b(credited|credit|received|deposited)\b/i
      .test(text);


  if (
    !isDebit &&
    !isCredit
  ) {

    return null;
  }


  const amount =
    extractAmount(
      text
    );


  if (
    amount === null ||
    isNaN(amount)
  ) {

    return null;
  }


  const transactionDate =
    extractTransactionDate(
      text,
      emailDate
    );


  const description =
    extractTransactionDescription(
      text
    );


  const supplier =
    extractSupplier(
      text,
      description
    );


  const note =
    extractNote(
      text
    );


  return {

    "Date":
      transactionDate,

    "Transaction Line Description":
      description ||
      subject ||
      "",

    "Credit Amount":
      isCredit
        ? amount
        : 0,

    "Debit Amount":
      isDebit
        ? amount
        : 0,

    "Account":
      "",

    "Bank Name":
      "HDFC Bank",

    "Supplier":
      supplier,

    "Note":
      note,

    "_source":
      "HDFC_BANK",

    "_sourceMessageId":
      messageId

  };
}


/**
 * ============================================================
 * CONVERT HDFC DATE
 * ============================================================
 */

function convertHdfcDate(
  rawDate
) {

  const parts =
    rawDate.split("-");


  if (
    parts.length !== 3
  ) {

    return rawDate;
  }


  const day =
    parts[0];


  const month =
    parts[1];


  let year =
    parts[2];


  if (
    year.length === 2
  ) {

    year =
      "20" +
      year;
  }


  return (
    year +
    "-" +
    month +
    "-" +
    day
  );
}


/**
 * ============================================================
 * EXTRACT AMOUNT
 * ============================================================
 */

function extractAmount(
  text
) {

  const patterns = [

    /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,

    /(?:amount|amt)\s*(?:of|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i

  ];


  for (
    const pattern of patterns
  ) {

    const match =
      text.match(
        pattern
      );


    if (match) {

      return parseFloat(
        match[1]
          .replace(
            /,/g,
            ""
          )
      );
    }
  }


  return null;
}


/**
 * ============================================================
 * EXTRACT DATE
 * ============================================================
 */

function extractTransactionDate(
  text,
  fallbackDate
) {

  const match =
    text.match(
      /(\d{2})[-\/](\d{2})[-\/](\d{2,4})/
    );


  if (match) {

    let year =
      match[3];


    if (
      year.length === 2
    ) {

      year =
        "20" +
        year;
    }


    return (
      year +
      "-" +
      match[2] +
      "-" +
      match[1]
    );
  }


  return Utilities.formatDate(
    fallbackDate,
    CONFIG.TIMEZONE,
    "yyyy-MM-dd"
  );
}


/**
 * ============================================================
 * EXTRACT DESCRIPTION
 * ============================================================
 */

function extractTransactionDescription(
  text
) {

  const patterns = [

    /on account of\s+(.+?)(?:\.|\n|$)/i,

    /transaction\s+(?:at|to|for)\s+(.+?)(?:\.|\n|$)/i,

    /(?:to|at)\s+([A-Za-z0-9._@\/\- ]{3,100})/i,

    /(?:UPI|NEFT|IMPS|RTGS)[\/:\-\s]+(.{3,100})/i

  ];


  for (
    const pattern of patterns
  ) {

    const match =
      text.match(
        pattern
      );


    if (match) {

      return cleanDescription(
        match[1]
      );
    }
  }


  return "";
}


/**
 * ============================================================
 * EXTRACT SUPPLIER
 * ============================================================
 */

function extractSupplier(
  text,
  description
) {

  if (!description) {

    return "";
  }


  const bracketMatch =
    description.match(
      /\(([^)]+)\)/
    );


  if (bracketMatch) {

    return bracketMatch[1]
      .trim();
  }


  return description

    .replace(
      /^(upi|neft|imps|rtgs)[\/:\-\s]*/i,
      ""
    )

    .replace(
      /\b\d{8,}\b/g,
      ""
    )

    .replace(
      /[\/\-]+/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


/**
 * ============================================================
 * EXTRACT NOTE
 * ============================================================
 */

function extractNote(
  text
) {

  const notes = [];


  const upiReference =
    text.match(
      /UPI transaction reference no\.?:\s*([0-9]+)/i
    );


  if (upiReference) {

    notes.push(
      "UPI transaction reference no.: " +
      upiReference[1]
    );
  }


  if (
    !upiReference
  ) {

    const reference =
      text.match(
        /(?:reference|ref|transaction)\s*(?:number|no\.?|id)?\s*[:#]?\s*([A-Z0-9\-]{6,})/i
      );


    if (reference) {

      notes.push(
        "Reference: " +
        reference[1]
      );
    }
  }


  if (
    /upi/i.test(text) &&
    notes.length === 0
  ) {

    notes.push(
      "UPI transaction"
    );
  }


  if (
    /neft/i.test(text)
  ) {

    notes.push(
      "NEFT transaction"
    );
  }


  if (
    /imps/i.test(text)
  ) {

    notes.push(
      "IMPS transaction"
    );
  }


  if (
    /rtgs/i.test(text)
  ) {

    notes.push(
      "RTGS transaction"
    );
  }


  return notes.join(
    " | "
  );
}


/**
 * ============================================================
 * SAVE TRANSACTIONS TO GOOGLE SHEET
 * ============================================================
 */

function saveTransactionsToSheet(
  transactions
) {

  const spreadsheet =
    SpreadsheetApp.openById(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    spreadsheet.getSheetByName(
      CONFIG.SHEET_NAME
    );


  if (!sheet) {

    throw new Error(
      "Transactions sheet does not exist."
    );
  }


  /**
   * Make sure Source column exists even if this
   * function is called directly.
   */

  initializeTransactionSheet();


  const rows =
    transactions.map(
      function(transaction) {

        return [

          transaction["Date"],

          transaction[
            "Transaction Line Description"
          ],

          transaction[
            "Credit Amount"
          ],

          transaction[
            "Debit Amount"
          ],

          transaction[
            "Account"
          ] || "",

          transaction[
            "Bank Name"
          ],

          transaction[
            "Supplier"
          ],

          transaction[
            "Note"
          ],

          transaction[
            "_categorisationSource"
          ] || "Unclassified"

        ];

      }
    );


  if (
    rows.length === 0
  ) {

    return;
  }


  const startRow =
    sheet.getLastRow() + 1;


  sheet
    .getRange(
      startRow,
      1,
      rows.length,
      9
    )
    .setValues(
      rows
    );


  /**
   * Format Credit and Debit amounts.
   */

  sheet
    .getRange(
      startRow,
      3,
      rows.length,
      2
    )
    .setNumberFormat(
      "0.00"
    );


  console.log(
    "Transactions appended to Google Sheet: " +
    rows.length
  );
}


/**
 * ============================================================
 * NORMALIZE TEXT
 * ============================================================
 */

function normalizeText(
  text
) {

  if (
    text === undefined ||
    text === null
  ) {

    return "";
  }


  return String(text)

    .replace(
      /\r/g,
      ""
    )

    .replace(
      /\t/g,
      " "
    )

    .replace(
      /[ ]{2,}/g,
      " "
    )

    .replace(
      /\n{3,}/g,
      "\n\n"
    )

    .trim();
}


/**
 * ============================================================
 * CLEAN DESCRIPTION
 * ============================================================
 */

function cleanDescription(
  value
) {

  if (
    value === undefined ||
    value === null
  ) {

    return "";
  }


  return String(value)

    .replace(
      /\s+/g,
      " "
    )

    .replace(
      /^[\s:,-]+|[\s.,-]+$/g,
      ""
    )

    .trim();
}


/**
 * ============================================================
 * CREATE MIDNIGHT TRIGGER
 * ============================================================
 */

function createMidnightTrigger() {

  const triggers =
    ScriptApp.getProjectTriggers();


  for (
    const trigger of triggers
  ) {

    if (
      trigger
        .getHandlerFunction() ===
      "syncHdfcTransactions"
    ) {

      ScriptApp.deleteTrigger(
        trigger
      );
    }
  }


  ScriptApp.newTrigger(
    "syncHdfcTransactions"
  )

    .timeBased()

    .everyDays(1)

    .atHour(0)

    .nearMinute(0)

    .create();


  console.log(
    "Midnight HDFC sync trigger created."
  );
}


/**
 * ============================================================
 * GET TRANSACTIONS API
 * ============================================================
 *
 * PARAMETERS:
 *
 * ?limit=100        (max 500)
 * ?offset=0
 * ?search=amazon
 * ?from=2026-09-01
 * ?to=2026-09-12
 * ?source=LLM | Historical%20Rules | Unclassified | Manual
 * ?account=Food%20Delivery
 *
 * "id" in each row is the row position (sheet row = id + 1).
 *
 * ============================================================
 */

function doGet(e) {

  try {

    console.log("=================================");
    console.log("TRANSACTIONS API REQUEST");
    console.log("Started: " + new Date());
    console.log("=================================");


    const spreadsheet =
      SpreadsheetApp.openById(
        CONFIG.SPREADSHEET_ID
      );


    const sheet =
      spreadsheet.getSheetByName(
        CONFIG.SHEET_NAME
      );


    if (!sheet) {

      return createJsonResponse({

        success: false,

        error:
          "Transactions sheet not found."

      });

    }


    const lastRow =
      sheet.getLastRow();


    if (lastRow <= 1) {

      return createJsonResponse({

        success: true,

        count: 0,

        total: 0,

        limit: 100,

        offset: 0,

        hasMore: false,

        data: []

      });

    }


    /**
     * Old 8-column sheets: Source becomes Unclassified.
     */

    const lastColumn =
      Math.max(
        sheet.getLastColumn(),
        8
      );


    const readColumns =
      Math.min(
        lastColumn,
        9
      );


    const data =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          readColumns
        )
        .getValues();


    /**
     * Convert sheet rows to JSON.
     */

    let transactions =
      data.map(
        function(row, index) {

          return Object.assign(
            {

              /**
               * Internal row ID (sheet row = id + 1).
               */

              id:
                index + 1

            },
            rowToApiTransaction(
              row
            )
          );

        }
      );


    const params =
      (e && e.parameter) || {};


    /**
     * Search filter.
     */

    const search =
      params.search
        ? String(
            params.search
          )
            .trim()
            .toLowerCase()
        : "";


    if (search) {

      transactions =
        transactions.filter(
          function(transaction) {

            const searchableText = [

              transaction.transactionLineDescription,

              transaction.account,

              transaction.bankName,

              transaction.supplier,

              transaction.note,

              transaction.source

            ]
              .join(" ")
              .toLowerCase();


            return searchableText.includes(
              search
            );

          }
        );

    }


    /**
     * From date filter.
     */

    const fromDate =
      params.from
        ? String(
            params.from
          ).trim()
        : "";


    if (fromDate) {

      transactions =
        transactions.filter(
          function(transaction) {

            return (
              transaction.date &&
              transaction.date >= fromDate
            );

          }
        );

    }


    /**
     * To date filter.
     */

    const toDate =
      params.to
        ? String(
            params.to
          ).trim()
        : "";


    if (toDate) {

      transactions =
        transactions.filter(
          function(transaction) {

            return (
              transaction.date &&
              transaction.date <= toDate
            );

          }
        );

    }


    /**
     * Source filter.
     */

    const source =
      params.source
        ? String(
            params.source
          )
            .trim()
            .toLowerCase()
        : "";


    if (source) {

      transactions =
        transactions.filter(
          function(transaction) {

            return (
              transaction.source
                .trim()
                .toLowerCase() ===
              source
            );

          }
        );

    }


    /**
     * Account filter.
     */

    const account =
      params.account
        ? String(
            params.account
          )
            .trim()
            .toLowerCase()
        : "";


    if (account) {

      transactions =
        transactions.filter(
          function(transaction) {

            return (
              transaction.account
                .trim()
                .toLowerCase() ===
              account
            );

          }
        );

    }


    const filteredTotal =
      transactions.length;


    /**
     * Pagination. Default limit 100, offset 0, max 500.
     */

    let limit =
      params.limit
        ? parseInt(
            params.limit,
            10
          )
        : 100;


    let offset =
      params.offset
        ? parseInt(
            params.offset,
            10
          )
        : 0;


    if (
      isNaN(limit) ||
      limit <= 0
    ) {

      limit = 100;

    }


    if (
      isNaN(offset) ||
      offset < 0
    ) {

      offset = 0;

    }


    if (
      limit > 500
    ) {

      limit = 500;

    }


    const paginatedTransactions =
      transactions.slice(
        offset,
        offset + limit
      );


    console.log(
      "API returned " +
      paginatedTransactions.length +
      " of " +
      filteredTotal +
      " transaction(s)."
    );


    return createJsonResponse({

      success: true,

      count:
        paginatedTransactions.length,

      total:
        filteredTotal,

      limit:
        limit,

      offset:
        offset,

      hasMore:
        (
          offset +
          limit
        ) < filteredTotal,

      data:
        paginatedTransactions

    });


  } catch (error) {

    console.error(
      "GET TRANSACTIONS API FAILED"
    );


    console.error(
      error.message
    );


    return createJsonResponse({

      success: false,

      error:
        error.message

    });

  }

}


/**
 * ============================================================
 * UPDATE / DELETE TRANSACTIONS API
 * ============================================================
 *
 * The dashboard sends text/plain JSON (avoids CORS preflight):
 *
 * {
 *   "action": "update",
 *   "id": 12,
 *   "expected": { date, transactionLineDescription, creditAmount, debitAmount },
 *   "data": { "account": "Groceries", ...any editable field }
 * }
 *
 * {
 *   "action": "delete",
 *   "id": 12,
 *   "expected": { date, transactionLineDescription, creditAmount, debitAmount }
 * }
 *
 * "id" is the row-position id that doGet returns. Because ids
 * shift when a row is deleted, "expected" is compared against
 * the row before anything is written, so a stale id can never
 * edit or delete the wrong transaction.
 *
 * Response: { success: true, id, data? }
 *        or { success: false, error }
 *
 * ============================================================
 */

function doPost(e) {

  const lock =
    LockService.getScriptLock();


  /**
   * Waits for a running sync (or another edit) to finish,
   * so row positions can't move underneath this request.
   */

  lock.waitLock(
    20000
  );


  try {

    if (
      !e ||
      !e.postData ||
      !e.postData.contents
    ) {

      throw new Error(
        "Request body is empty."
      );
    }


    const request =
      JSON.parse(
        e.postData.contents
      );


    const action =
      String(
        request.action || ""
      )
        .trim()
        .toLowerCase();


    console.log("=================================");
    console.log("TRANSACTIONS API " + action.toUpperCase());
    console.log("ID: " + request.id);
    console.log("=================================");


    const sheet =
      SpreadsheetApp
        .openById(
          CONFIG.SPREADSHEET_ID
        )
        .getSheetByName(
          CONFIG.SHEET_NAME
        );


    if (!sheet) {

      throw new Error(
        "Transactions sheet not found."
      );
    }


    const rowNumber =
      resolveTransactionRow(
        sheet,
        request.id,
        request.expected
      );


    if (
      action === "delete"
    ) {

      sheet.deleteRow(
        rowNumber
      );


      console.log(
        "Deleted sheet row " +
        rowNumber
      );


      return createJsonResponse({

        success: true,

        id:
          Number(
            request.id
          )

      });
    }


    if (
      action === "update"
    ) {

      const updated =
        updateTransactionRow(
          sheet,
          rowNumber,
          request.data || {}
        );


      console.log(
        "Updated sheet row " +
        rowNumber
      );


      return createJsonResponse({

        success: true,

        id:
          Number(
            request.id
          ),

        data:
          updated

      });
    }


    throw new Error(
      "Unknown action: " +
      request.action
    );


  } catch (error) {

    console.error(
      "TRANSACTIONS POST API FAILED"
    );

    console.error(
      error.message
    );


    return createJsonResponse({

      success: false,

      error:
        error.message

    });


  } finally {

    lock.releaseLock();
  }
}


/**
 * ============================================================
 * RESOLVE + VERIFY ROW
 * ============================================================
 */

function resolveTransactionRow(
  sheet,
  id,
  expected
) {

  const numericId =
    parseInt(
      id,
      10
    );


  if (
    isNaN(numericId) ||
    numericId < 1
  ) {

    throw new Error(
      "Invalid transaction id: " +
      id
    );
  }


  const rowNumber =
    numericId + 1;


  if (
    rowNumber > sheet.getLastRow()
  ) {

    throw new Error(
      "Transaction " +
      id +
      " no longer exists. Refresh the dashboard."
    );
  }


  if (!expected) {

    throw new Error(
      "Missing 'expected' row details; refusing to change an unverified row."
    );
  }


  const row =
    sheet
      .getRange(
        rowNumber,
        1,
        1,
        4
      )
      .getValues()[0];


  const sheetKey =
    createNormalizedKey([

      row[0],

      row[1],

      Number(row[2] || 0),

      Number(row[3] || 0)

    ]);


  const expectedKey =
    createNormalizedKey([

      expected.date,

      expected.transactionLineDescription,

      Number(expected.creditAmount || 0),

      Number(expected.debitAmount || 0)

    ]);


  if (
    sheetKey !== expectedKey
  ) {

    console.log(
      "Row mismatch. Sheet: " +
      sheetKey +
      " | Expected: " +
      expectedKey
    );


    throw new Error(
      "The sheet changed since the dashboard loaded (row " +
      rowNumber +
      " no longer matches). Refresh and try again."
    );
  }


  return rowNumber;
}


/**
 * ============================================================
 * UPDATE ROW
 * ============================================================
 */

function updateTransactionRow(
  sheet,
  rowNumber,
  data
) {

  const columnCount =
    Object.keys(
      TRANSACTION_COLUMNS
    ).length;


  const range =
    sheet.getRange(
      rowNumber,
      1,
      1,
      columnCount
    );


  const row =
    range.getValues()[0];


  const changed =
    [];


  Object.keys(
    data
  ).forEach(
    function(field) {

      const column =
        TRANSACTION_COLUMNS[field];


      /**
       * Ignore unknown fields and Source (set below).
       */

      if (
        !column ||
        field === "source"
      ) {

        return;
      }


      row[column - 1] =
        sanitizeTransactionValue(
          field,
          data[field]
        );


      changed.push(
        field
      );
    }
  );


  if (
    changed.length === 0
  ) {

    throw new Error(
      "No editable fields were sent."
    );
  }


  if (
    Number(row[2] || 0) > 0 &&
    Number(row[3] || 0) > 0
  ) {

    throw new Error(
      "A transaction cannot have both a credit and a debit amount."
    );
  }


  row[TRANSACTION_COLUMNS.source - 1] =
    CONFIG.MANUAL_SOURCE;


  range.setValues([
    row
  ]);


  sheet
    .getRange(
      rowNumber,
      3,
      1,
      2
    )
    .setNumberFormat(
      "0.00"
    );


  console.log(
    "Changed fields: " +
    changed.join(", ")
  );


  return rowToApiTransaction(
    row
  );
}


/**
 * ============================================================
 * VALIDATE A SINGLE FIELD
 * ============================================================
 */

function sanitizeTransactionValue(
  field,
  value
) {

  if (
    field === "date"
  ) {

    const date =
      String(value || "").trim();


    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {

      throw new Error(
        "Date must be in yyyy-MM-dd format."
      );
    }


    /**
     * Same format the Gmail sync writes.
     */

    return date;
  }


  if (
    field === "creditAmount" ||
    field === "debitAmount"
  ) {

    const amount =
      Number(
        value || 0
      );


    if (
      isNaN(amount) ||
      amount < 0
    ) {

      throw new Error(
        field +
        " must be a positive number or 0."
      );
    }


    return amount;
  }


  if (
    field === "account"
  ) {

    const account =
      String(value || "").trim();


    if (!account) {

      return "";
    }


    /**
     * Only allow heads from the Chart of Accounts sheet,
     * returned with the sheet's exact spelling.
     */

    const exactAccount =
      findExactAccountInChart(
        account,
        getChartOfAccounts()
      );


    if (!exactAccount) {

      throw new Error(
        "'" +
        account +
        "' is not in the Chart of Accounts sheet."
      );
    }


    return exactAccount;
  }


  return String(
    value === null ||
    value === undefined
      ? ""
      : value
  ).trim();
}


/**
 * ============================================================
 * SHEET ROW -> API TRANSACTION
 * ============================================================
 *
 * Shared by doGet and doPost so both return the same shape.
 */

function rowToApiTransaction(
  row
) {

  return {

    date:
      formatApiDate(
        row[0]
      ),

    transactionLineDescription:
      String(
        row[1] || ""
      ),

    creditAmount:
      Number(
        row[2] || 0
      ),

    debitAmount:
      Number(
        row[3] || 0
      ),

    account:
      String(
        row[4] || ""
      ),

    bankName:
      String(
        row[5] || ""
      ),

    supplier:
      String(
        row[6] || ""
      ),

    note:
      String(
        row[7] || ""
      ),

    source:
      String(
        row[8] || "Unclassified"
      )

  };
}


/**
 * ============================================================
 * CREATE JSON RESPONSE
 * ============================================================
 */

function createJsonResponse(
  data
) {

  return ContentService

    .createTextOutput(
      JSON.stringify(
        data
      )
    )

    .setMimeType(
      ContentService.MimeType.JSON
    );

}


/**
 * ============================================================
 * FORMAT API DATE
 * ============================================================
 */

function formatApiDate(
  value
) {

  if (
    value instanceof Date
  ) {

    return Utilities.formatDate(
      value,
      CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );

  }


  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "";

  }


  return String(
    value
  ).trim();

}


/**
 * ============================================================
 * MANUAL TESTS (run from the Apps Script editor)
 * ============================================================
 */

function testHdfcSheetSync() {

  console.log(
    "Starting manual HDFC sheet sync..."
  );


  syncHdfcTransactions();


  console.log(
    "Manual HDFC sheet sync completed."
  );
}


function testHistoricalRuleMatching() {

  const rules =
    getHistoricalRules();


  console.log(
    "Historical Rules loaded: " +
    rules.length
  );


  const testTransaction = {

    "Transaction Line Description":
      "paytmqr7jtml9eqx1@paytm (COCO BP KALAMBOLI2)",

    "Supplier":
      "COCO BP KALAMBOLI2"

  };


  const result =
    findHistoricalAccount(
      testTransaction,
      rules
    );


  console.log(
    "TEST RESULT: " +
    (
      result ||
      "NO MATCH"
    )
  );
}


function testNvidiaClassification() {

  const chartOfAccounts =
    getChartOfAccounts();


  const testTransaction = {

    "Date":
      "2026-09-12",

    "Transaction Line Description":
      "paytmqr7jtml9eqx1@paytm (COCO BP KALAMBOLI2)",

    "Supplier":
      "COCO BP KALAMBOLI2",

    "Debit Amount":
      200,

    "Credit Amount":
      0,

    "Bank Name":
      "HDFC Bank",

    "Note":
      "UPI transaction reference no.: 129473866154"

  };


  const result =
    classifyWithNvidia(
      testTransaction,
      chartOfAccounts
    );


  console.log(
    "NVIDIA TEST RESULT: " +
    result
  );
}


/**
 * Re-saves row id 1 with its current account to check
 * permissions and the row-matching logic. Only change:
 * Source becomes "Manual".
 */

function testDoPostUpdate() {

  const sheet =
    SpreadsheetApp
      .openById(
        CONFIG.SPREADSHEET_ID
      )
      .getSheetByName(
        CONFIG.SHEET_NAME
      );


  const row =
    sheet
      .getRange(
        2,
        1,
        1,
        5
      )
      .getValues()[0];


  const response =
    doPost({

      postData: {

        contents:
          JSON.stringify({

            action:
              "update",

            id:
              1,

            expected: {

              date:
                formatApiDate(row[0]),

              transactionLineDescription:
                row[1],

              creditAmount:
                row[2],

              debitAmount:
                row[3]

            },

            data: {

              account:
                row[4]

            }

          })

      }

    });


  console.log(
    response.getContent()
  );
}
