import type {
  CoreEngineCapitalTransactionInput,
  CoreEngineCapitalTransactionTermOverride,
} from "./input";
import {
  asNumber,
  asRecord,
  asString,
  parseIsoDate,
  roundMoney,
  sumNumbers,
  toNumber,
} from "./helpers";
import { findSourceDocumentPayloadById } from "./income-source-documents";

type CapitalTransactionTermOptions = {
  readonly sourceDocuments?: ReadonlyArray<unknown>;
  readonly termOverrides?: ReadonlyArray<CoreEngineCapitalTransactionTermOverride>;
};

function sumCapitalGainOrLoss(
  transactions: ReadonlyArray<CoreEngineCapitalTransactionInput>,
): number {
  return roundMoney(
    sumNumbers(
      transactions.map((transaction) => {
        if (transaction.gain_or_loss != null) {
          return transaction.gain_or_loss;
        }

        return (
          transaction.proceeds -
          toNumber(transaction.cost_basis) +
          toNumber(transaction.adjustments)
        );
      }),
    ),
  );
}

function inferCapitalTransactionTerm(
  transaction: CoreEngineCapitalTransactionInput,
  options?: CapitalTransactionTermOptions,
): "short" | "long" | "unknown" {
  if (transaction.term === "short" || transaction.term === "long") {
    return transaction.term;
  }

  const termOverride = options?.termOverrides?.find((override) => {
    if (override.source_document_id !== transaction.source_document_id) {
      return false;
    }

    if (roundMoney(override.proceeds) !== roundMoney(transaction.proceeds)) {
      return false;
    }

    if (override.date_sold && override.date_sold !== transaction.date_sold) {
      return false;
    }

    if (override.date_acquired && override.date_acquired !== transaction.date_acquired) {
      return false;
    }

    return true;
  });

  if (termOverride) {
    return termOverride.term;
  }

  const payload = options?.sourceDocuments
    ? findSourceDocumentPayloadById(
        options.sourceDocuments,
        transaction.source_document_id,
        "FORM_1099_B",
      )
    : undefined;
  const brokerTransactions = Array.isArray(payload?.transactions)
    ? payload.transactions
        .map((candidate) => asRecord(candidate))
        .filter((candidate): candidate is Record<string, unknown> => candidate !== undefined)
    : [];
  const matchingBrokerTransaction =
    brokerTransactions.find(
      (candidate) =>
        roundMoney(asNumber(candidate.proceeds) ?? Number.NaN) === roundMoney(transaction.proceeds) &&
        asString(candidate.date_sold) === transaction.date_sold &&
        (transaction.date_acquired == null ||
          asString(candidate.date_acquired) === transaction.date_acquired),
    ) ??
    brokerTransactions.find(
      (candidate) =>
        roundMoney(asNumber(candidate.proceeds) ?? Number.NaN) === roundMoney(transaction.proceeds) &&
        asString(candidate.date_sold) === transaction.date_sold,
    );
  const brokerTransactionTerm = asString(matchingBrokerTransaction?.term);

  if (brokerTransactionTerm === "short" || brokerTransactionTerm === "long") {
    return brokerTransactionTerm;
  }

  const acquiredDate = parseIsoDate(
    transaction.date_acquired ?? asString(matchingBrokerTransaction?.date_acquired) ?? undefined,
  );
  const soldDate = parseIsoDate(transaction.date_sold);

  if (!acquiredDate || !soldDate || soldDate.getTime() < acquiredDate.getTime()) {
    return "unknown";
  }

  const oneYearAfterAcquired = new Date(acquiredDate.getTime());
  oneYearAfterAcquired.setUTCFullYear(oneYearAfterAcquired.getUTCFullYear() + 1);

  return soldDate.getTime() > oneYearAfterAcquired.getTime() ? "long" : "short";
}

function sumCapitalGainOrLossByTerm(
  transactions: ReadonlyArray<CoreEngineCapitalTransactionInput>,
  term: "short" | "long",
  options?: CapitalTransactionTermOptions,
): number {
  return sumCapitalGainOrLoss(
    transactions.filter((transaction) =>
      term === "long"
        ? inferCapitalTransactionTerm(transaction, options) === "long"
        : inferCapitalTransactionTerm(transaction, options) !== "long",
    ),
  );
}

export { inferCapitalTransactionTerm, sumCapitalGainOrLoss, sumCapitalGainOrLossByTerm };
