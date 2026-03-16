import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { startTransition, useEffect, useState } from "react";

import { formatCliError } from "../core/errors";
import type { CliRuntime } from "../core/runtime";
import {
  formatRequestedStateCodes,
  parseRequestedStateCodes,
} from "../core/state-support";
import { supportedFilingStatuses, type SupportedFilingStatus } from "../core/types";
import {
  type ExportPresetId,
  addBlankDividendDraft,
  addBlankEstimatedPayment,
  addBlankExtensionPayment,
  addBlankInterestDraft,
  addBlankRetirementDraft,
  addBlankW2Draft,
  type DividendDraft,
  type EfileDraft,
  exportPresetOptions,
  type HouseholdDraft,
  type IncomeDraft,
  type InterestDraft,
  type InteractiveSession,
  type PaymentsDraft,
  type RetirementDraft,
  type W2Draft,
  computeInteractiveSession,
  createInteractiveSession,
  createEmptyEstimatedPaymentDraft,
  createEmptyExtensionPaymentDraft,
  emptyPaymentsDraft,
  exportInteractiveSession,
  openInteractiveSession,
  removeDividendDraft,
  removeEstimatedPayment,
  removeExtensionPayment,
  removeInterestDraft,
  removeRetirementDraft,
  removeW2Draft,
  saveInteractiveDrafts,
} from "./interactive-workflow";
import {
  buildPersonDirectory,
  empty1095AEditorDraft,
  empty1098EditorDraft,
  empty1098EEditorDraft,
  empty1098TEditorDraft,
  empty1099BEditorDraft,
  empty1099GEditorDraft,
  empty1099MiscEditorDraft,
  empty1099NecEditorDraft,
  emptyBrokerTransactionEditorDraft,
  emptyCareExpenseEditorDraft,
  emptyCareProviderEditorDraft,
  emptyDependentEditorDraft,
  emptyElectionChoiceEditorDraft,
  emptyEnergyProjectEditorDraft,
  emptyHsaCoverageMonthEditorDraft,
  emptyMarketplaceMonthlyRowEditorDraft,
  emptyNamedAmountEditorDraft,
  emptyOtherIncomeItemEditorDraft,
  emptyScheduleCBusinessEditorDraft,
  emptyScheduleEActivityEditorDraft,
  emptySpouseEditorDraft,
  emptySupplementalWithholdingEditorDraft,
  emptySsa1099EditorDraft,
  emptyVehicleCreditEditorDraft,
  type InteractiveSupplementalFederalDraft,
  parseInteractiveSupplementalFederalDraft,
  serializeInteractiveSupplementalFederalDraft,
} from "./interactive-supplemental-federal-editor";

const stepIds = [
  "session",
  "household",
  "family",
  "documents",
  "supplemental_income",
  "deductions",
  "credits",
  "overrides",
  "w2",
  "interest",
  "dividend",
  "retirement",
  "payments",
  "banking",
  "efile",
  "results",
  "export",
] as const;

type StepId = (typeof stepIds)[number];
type StatusTone = "info" | "success" | "error";
type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type SelectChoice<T extends string> = {
  readonly name: string;
  readonly description: string;
  readonly value: T;
};

type ResultState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | {
      readonly status: "ready";
      readonly payload: Awaited<ReturnType<typeof computeInteractiveSession>>;
    }
  | { readonly status: "error"; readonly message: string };

type ExportState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | {
      readonly status: "ready";
      readonly payload: Awaited<ReturnType<typeof exportInteractiveSession>>;
    }
  | { readonly status: "error"; readonly message: string };

export function InteractiveHome(props: {
  readonly initialInputPath: string | null;
  readonly onExit: () => void;
  readonly runtime: CliRuntime;
}) {
  const { width } = useTerminalDimensions();
  const isWide = width >= 120;
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [pathInput, setPathInput] = useState(props.initialInputPath ?? "");
  const [createFilingStatus, setCreateFilingStatus] = useState<SupportedFilingStatus>("single");
  const [createRequestedStatesInput, setCreateRequestedStatesInput] = useState("");
  const [session, setSession] = useState<InteractiveSession | null>(null);
  const [householdDraft, setHouseholdDraft] = useState<HouseholdDraft | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<IncomeDraft | null>(null);
  const [supplementalFederalDraft, setSupplementalFederalDraft] =
    useState<InteractiveSupplementalFederalDraft | null>(null);
  const [paymentsDraft, setPaymentsDraft] = useState<PaymentsDraft | null>(null);
  const [efileDraft, setEfileDraft] = useState<EfileDraft | null>(null);
  const [familyPanel, setFamilyPanel] = useState<"taxpayer" | "spouse" | "dependents">(
    "taxpayer",
  );
  const [documentsPanel, setDocumentsPanel] = useState<
    "1099_b" | "1099_g" | "ssa_1099" | "1098" | "1098_e" | "1098_t" | "1095_a"
  >("1099_b");
  const [supplementalIncomePanel, setSupplementalIncomePanel] = useState<
    "1099_nec" | "1099_misc" | "schedule_c" | "schedule_e" | "other_income" | "withholdings"
  >("1099_nec");
  const [deductionsPanel, setDeductionsPanel] = useState<"adjustments" | "itemized">(
    "adjustments",
  );
  const [creditsPanel, setCreditsPanel] = useState<
    | "candidates"
    | "care_providers"
    | "care_expenses"
    | "energy"
    | "vehicles"
    | "other_credits"
    | "hsa"
  >("candidates");
  const [selectedW2Index, setSelectedW2Index] = useState(0);
  const [selectedInterestIndex, setSelectedInterestIndex] = useState(0);
  const [selectedDividendIndex, setSelectedDividendIndex] = useState(0);
  const [selectedRetirementIndex, setSelectedRetirementIndex] = useState(0);
  const [selectedEstimatedPaymentIndex, setSelectedEstimatedPaymentIndex] = useState(0);
  const [selectedExtensionPaymentIndex, setSelectedExtensionPaymentIndex] = useState(0);
  const [selectedDependentIndex, setSelectedDependentIndex] = useState(0);
  const [selected1099BIndex, setSelected1099BIndex] = useState(0);
  const [selected1099BTransactionIndex, setSelected1099BTransactionIndex] = useState(0);
  const [selected1099GIndex, setSelected1099GIndex] = useState(0);
  const [selectedSsa1099Index, setSelectedSsa1099Index] = useState(0);
  const [selected1098Index, setSelected1098Index] = useState(0);
  const [selected1098EIndex, setSelected1098EIndex] = useState(0);
  const [selected1098TIndex, setSelected1098TIndex] = useState(0);
  const [selected1095AIndex, setSelected1095AIndex] = useState(0);
  const [selected1095AMonthlyRowIndex, setSelected1095AMonthlyRowIndex] = useState(0);
  const [selected1099NecIndex, setSelected1099NecIndex] = useState(0);
  const [selected1099MiscIndex, setSelected1099MiscIndex] = useState(0);
  const [selectedScheduleCIndex, setSelectedScheduleCIndex] = useState(0);
  const [selectedScheduleEIndex, setSelectedScheduleEIndex] = useState(0);
  const [selectedOtherIncomeIndex, setSelectedOtherIncomeIndex] = useState(0);
  const [selectedSupplementalWithholdingIndex, setSelectedSupplementalWithholdingIndex] =
    useState(0);
  const [selectedOtherAdjustmentIndex, setSelectedOtherAdjustmentIndex] = useState(0);
  const [selectedOtherItemizedDeductionIndex, setSelectedOtherItemizedDeductionIndex] =
    useState(0);
  const [selectedCareProviderIndex, setSelectedCareProviderIndex] = useState(0);
  const [selectedCareExpenseIndex, setSelectedCareExpenseIndex] = useState(0);
  const [selectedEnergyProjectIndex, setSelectedEnergyProjectIndex] = useState(0);
  const [selectedVehicleCreditIndex, setSelectedVehicleCreditIndex] = useState(0);
  const [selectedOtherNonrefundableCreditIndex, setSelectedOtherNonrefundableCreditIndex] =
    useState(0);
  const [selectedOtherRefundableCreditIndex, setSelectedOtherRefundableCreditIndex] =
    useState(0);
  const [selectedHsaCoverageIndex, setSelectedHsaCoverageIndex] = useState(0);
  const [selectedFederalOverrideIndex, setSelectedFederalOverrideIndex] = useState(0);
  const [selectedOtherElectionIndex, setSelectedOtherElectionIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    readonly tone: StatusTone;
    readonly text: string;
  } | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [resultState, setResultState] = useState<ResultState>({
    status: "idle",
  });
  const [exportOutputDir, setExportOutputDir] = useState("");
  const [exportPresetId, setExportPresetId] = useState<ExportPresetId>("default");
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
  });
  const [autoOpenAttempted, setAutoOpenAttempted] = useState(false);
  const activeStep = stepIds[activeStepIndex] ?? "session";
  const personDirectory =
    supplementalFederalDraft == null
      ? []
      : buildPersonDirectory({
          householdDraft,
          familyDraft: supplementalFederalDraft.family,
        });
  const focusSlots = resolveMaxFocusIndex({
    activeStep,
    creditsPanel,
    deductionsPanel,
    documentsPanel,
    efileDraft,
    familyPanel,
    incomeDraft,
    paymentsDraft,
    selected1095AIndex,
    selected1099BIndex,
    supplementalFederalDraft,
    supplementalIncomePanel,
  });

  const setStatus = (tone: StatusTone, text: string) => {
    setStatusMessage({ tone, text });
  };

  const clearResultAndExport = () => {
    startTransition(() => {
      setResultState({ status: "idle" });
      setExportState({ status: "idle" });
    });
  };

  const markDirty = () => {
    setDirty(true);
    clearResultAndExport();
  };

  const persistSessionDrafts = async (): Promise<InteractiveSession | null> => {
    if (
      session == null ||
      householdDraft == null ||
      incomeDraft == null ||
      supplementalFederalDraft == null ||
      paymentsDraft == null ||
      efileDraft == null
    ) {
      setStatus("error", "Open or create a session before saving.");
      return null;
    }

    if (!dirty) {
      return session;
    }

    setBusyLabel("Saving session");

    try {
      const serializedSupplementalFederalDraft = serializeInteractiveSupplementalFederalDraft({
        draft: supplementalFederalDraft,
        householdDraft,
        writtenAt: props.runtime.now().toISOString(),
      });
      const savedSession = await saveInteractiveDrafts({
        session,
        householdDraft,
        incomeDraft,
        supplementalFederalDraft: serializedSupplementalFederalDraft,
        paymentsDraft,
        efileDraft,
        writtenAt: props.runtime.now().toISOString(),
      });

      startTransition(() => {
        setSession(savedSession);
        setHouseholdDraft(savedSession.householdDraft);
        setIncomeDraft(savedSession.incomeDraft);
        setSupplementalFederalDraft(
          parseInteractiveSupplementalFederalDraft(savedSession.supplementalFederalDraft),
        );
        setPaymentsDraft(savedSession.paymentsDraft);
        setEfileDraft(savedSession.efileDraft);
        setDirty(false);
      });
      setStatus("success", "Session saved to canonical-return.json");
      return savedSession;
    } catch (error) {
      setStatus("error", formatCliError(error));
      return null;
    } finally {
      setBusyLabel(null);
    }
  };

  const handleOpenSession = async (explicitPath?: string) => {
    const nextPath = explicitPath ?? pathInput.trim();

    if (nextPath.length === 0) {
      setStatus("error", "Enter a session directory or canonical return path first.");
      return;
    }

    setBusyLabel("Opening session");

    try {
      const openedSession = await openInteractiveSession(nextPath);

      startTransition(() => {
        setSession(openedSession);
        setHouseholdDraft(openedSession.householdDraft);
        setIncomeDraft(openedSession.incomeDraft);
        setSupplementalFederalDraft(
          parseInteractiveSupplementalFederalDraft(openedSession.supplementalFederalDraft),
        );
        setPaymentsDraft(openedSession.paymentsDraft);
        setEfileDraft(openedSession.efileDraft);
        setSelectedW2Index(0);
        setSelectedInterestIndex(0);
        setSelectedDividendIndex(0);
        setSelectedRetirementIndex(0);
        setSelectedEstimatedPaymentIndex(0);
        setSelectedExtensionPaymentIndex(0);
        setSelectedDependentIndex(0);
        setSelected1099BIndex(0);
        setSelected1099BTransactionIndex(0);
        setSelected1099GIndex(0);
        setSelectedSsa1099Index(0);
        setSelected1098Index(0);
        setSelected1098EIndex(0);
        setSelected1098TIndex(0);
        setSelected1095AIndex(0);
        setSelected1095AMonthlyRowIndex(0);
        setSelected1099NecIndex(0);
        setSelected1099MiscIndex(0);
        setSelectedScheduleCIndex(0);
        setSelectedScheduleEIndex(0);
        setSelectedOtherIncomeIndex(0);
        setSelectedSupplementalWithholdingIndex(0);
        setSelectedOtherAdjustmentIndex(0);
        setSelectedOtherItemizedDeductionIndex(0);
        setSelectedCareProviderIndex(0);
        setSelectedCareExpenseIndex(0);
        setSelectedEnergyProjectIndex(0);
        setSelectedVehicleCreditIndex(0);
        setSelectedOtherNonrefundableCreditIndex(0);
        setSelectedOtherRefundableCreditIndex(0);
        setSelectedHsaCoverageIndex(0);
        setSelectedFederalOverrideIndex(0);
        setSelectedOtherElectionIndex(0);
        setPathInput(openedSession.sessionDir);
        setCreateRequestedStatesInput(
          openedSession.canonicalReturn.requested_jurisdictions.states.join(", "),
        );
        setExportOutputDir(openedSession.sessionDir);
        setDirty(false);
        setActiveStepIndex(1);
        setFocusIndex(0);
      });
      clearResultAndExport();
      setStatus("success", `Opened ${openedSession.sessionDir}`);
    } catch (error) {
      setStatus("error", formatCliError(error));
    } finally {
      setBusyLabel(null);
    }
  };

  const handleCreateSession = async () => {
    setBusyLabel("Creating session");

    try {
      const requestedStateCodes = parseRequestedStateCodes([createRequestedStatesInput]);
      const createdSession = await createInteractiveSession({
        filingStatus: createFilingStatus,
        requestedStateCodes,
        runtime: props.runtime,
        sessionDir: pathInput.trim().length > 0 ? pathInput.trim() : null,
      });

      startTransition(() => {
        setSession(createdSession);
        setHouseholdDraft(createdSession.householdDraft);
        setIncomeDraft(createdSession.incomeDraft);
        setSupplementalFederalDraft(
          parseInteractiveSupplementalFederalDraft(createdSession.supplementalFederalDraft),
        );
        setPaymentsDraft(createdSession.paymentsDraft);
        setEfileDraft(createdSession.efileDraft);
        setSelectedW2Index(0);
        setSelectedInterestIndex(0);
        setSelectedDividendIndex(0);
        setSelectedRetirementIndex(0);
        setSelectedEstimatedPaymentIndex(0);
        setSelectedExtensionPaymentIndex(0);
        setSelectedDependentIndex(0);
        setSelected1099BIndex(0);
        setSelected1099BTransactionIndex(0);
        setSelected1099GIndex(0);
        setSelectedSsa1099Index(0);
        setSelected1098Index(0);
        setSelected1098EIndex(0);
        setSelected1098TIndex(0);
        setSelected1095AIndex(0);
        setSelected1095AMonthlyRowIndex(0);
        setSelected1099NecIndex(0);
        setSelected1099MiscIndex(0);
        setSelectedScheduleCIndex(0);
        setSelectedScheduleEIndex(0);
        setSelectedOtherIncomeIndex(0);
        setSelectedSupplementalWithholdingIndex(0);
        setSelectedOtherAdjustmentIndex(0);
        setSelectedOtherItemizedDeductionIndex(0);
        setSelectedCareProviderIndex(0);
        setSelectedCareExpenseIndex(0);
        setSelectedEnergyProjectIndex(0);
        setSelectedVehicleCreditIndex(0);
        setSelectedOtherNonrefundableCreditIndex(0);
        setSelectedOtherRefundableCreditIndex(0);
        setSelectedHsaCoverageIndex(0);
        setSelectedFederalOverrideIndex(0);
        setSelectedOtherElectionIndex(0);
        setPathInput(createdSession.sessionDir);
        setCreateRequestedStatesInput(
          createdSession.canonicalReturn.requested_jurisdictions.states.join(", "),
        );
        setExportOutputDir(createdSession.sessionDir);
        setDirty(false);
        setActiveStepIndex(1);
        setFocusIndex(0);
      });
      clearResultAndExport();
      setStatus("success", `Created ${createdSession.sessionDir}`);
    } catch (error) {
      setStatus("error", formatCliError(error));
    } finally {
      setBusyLabel(null);
    }
  };

  const handleCompute = async () => {
    const activeSession = await persistSessionDrafts();

    if (activeSession == null) {
      return;
    }

    setBusyLabel("Running tax calculation");
    startTransition(() => {
      setResultState({ status: "running" });
      setActiveStepIndex(stepIds.indexOf("results"));
      setFocusIndex(0);
    });

    try {
      const payload = await computeInteractiveSession(activeSession);

      startTransition(() => {
        setResultState({
          status: "ready",
          payload,
        });
      });
      setStatus("success", "Tax calculation complete.");
    } catch (error) {
      startTransition(() => {
        setResultState({
          status: "error",
          message: formatCliError(error),
        });
      });
      setStatus("error", formatCliError(error));
    } finally {
      setBusyLabel(null);
    }
  };

  const handleExport = async () => {
    const activeSession = await persistSessionDrafts();

    if (activeSession == null) {
      return;
    }

    setBusyLabel("Exporting artifacts");
    startTransition(() => {
      setExportState({ status: "running" });
      setActiveStepIndex(stepIds.indexOf("export"));
      setFocusIndex(0);
    });

    try {
      const payload = await exportInteractiveSession({
        session: activeSession,
        presetId: exportPresetId,
        runtime: props.runtime,
        outputDir: exportOutputDir.trim().length > 0 ? exportOutputDir.trim() : null,
      });

      startTransition(() => {
        setExportState({
          status: "ready",
          payload,
        });
      });
      setStatus("success", `Exported ${payload.artifacts.length} artifact(s).`);
    } catch (error) {
      startTransition(() => {
        setExportState({
          status: "error",
          message: formatCliError(error),
        });
      });
      setStatus("error", formatCliError(error));
    } finally {
      setBusyLabel(null);
    }
  };

  useEffect(() => {
    if (
      props.initialInputPath == null ||
      props.initialInputPath.length === 0 ||
      autoOpenAttempted
    ) {
      return;
    }

    setAutoOpenAttempted(true);
    void handleOpenSession(props.initialInputPath);
  }, [autoOpenAttempted, props.initialInputPath]);

  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      props.onExit();
      return;
    }

    if (key.ctrl && key.name === "o") {
      void handleOpenSession();
      return;
    }

    if (key.ctrl && key.name === "n") {
      void handleCreateSession();
      return;
    }

    if (key.ctrl && key.name === "s") {
      void persistSessionDrafts();
      return;
    }

    if (key.ctrl && key.name === "r") {
      void handleCompute();
      return;
    }

    if (key.ctrl && key.name === "e") {
      void handleExport();
      return;
    }

    if (key.name === "pagedown") {
      setActiveStepIndex((current) => Math.min(current + 1, stepIds.length - 1));
      setFocusIndex(0);
      return;
    }

    if (key.name === "pageup") {
      setActiveStepIndex((current) => Math.max(current - 1, 0));
      setFocusIndex(0);
      return;
    }

    if (key.shift && key.name === "tab") {
      setFocusIndex((current) => previousFocusIndex(current, focusSlots));
      return;
    }

    if (key.name === "tab") {
      setFocusIndex((current) => nextFocusIndex(current, focusSlots));
      return;
    }

    if (
      activeStep === "family" &&
      supplementalFederalDraft != null &&
      familyPanel === "dependents" &&
      focusIndex === 1
    ) {
      if (key.name === "a") {
        setSupplementalFederalDraft((current) =>
          current == null
            ? current
            : {
                ...current,
                family: {
                  ...current.family,
                  dependents: [...current.family.dependents, emptyDependentEditorDraft()],
                },
              },
        );
        setSelectedDependentIndex(supplementalFederalDraft.family.dependents.length);
        markDirty();
        setStatus("success", "Added a dependent.");
        return;
      }

      if (
        (key.name === "backspace" || key.name === "delete") &&
        supplementalFederalDraft.family.dependents.length > 0
      ) {
        setSupplementalFederalDraft((current) =>
          current == null
            ? current
            : {
                ...current,
                family: {
                  ...current.family,
                  dependents: current.family.dependents.filter(
                    (_, index) => index !== selectedDependentIndex,
                  ),
                },
              },
        );
        setSelectedDependentIndex((current) => Math.max(current - 1, 0));
        markDirty();
        setStatus("success", "Removed the selected dependent.");
        return;
      }
    }

    if (activeStep === "documents" && supplementalFederalDraft != null) {
      if (documentsPanel === "1099_b" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    brokerageForms: [...current.documents.brokerageForms, empty1099BEditorDraft()],
                  },
                },
          );
          setSelected1099BIndex(supplementalFederalDraft.documents.brokerageForms.length);
          setSelected1099BTransactionIndex(0);
          markDirty();
          setStatus("success", "Added a 1099-B draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.documents.brokerageForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    brokerageForms: current.documents.brokerageForms.filter(
                      (_, index) => index !== selected1099BIndex,
                    ),
                  },
                },
          );
          setSelected1099BIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1099-B draft.");
          return;
        }
      }

      if (documentsPanel === "1099_b" && focusIndex === 6) {
        const activeForm =
          supplementalFederalDraft.documents.brokerageForms[selected1099BIndex] ?? null;

        if (key.name === "a" && activeForm != null) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    brokerageForms: updateArrayEntry(
                      current.documents.brokerageForms,
                      selected1099BIndex,
                      (entry) => ({
                        ...entry,
                        transactions: [...entry.transactions, emptyBrokerTransactionEditorDraft()],
                      }),
                    ),
                  },
                },
          );
          setSelected1099BTransactionIndex(activeForm.transactions.length);
          markDirty();
          setStatus("success", "Added a broker transaction.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          activeForm != null &&
          activeForm.transactions.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    brokerageForms: updateArrayEntry(
                      current.documents.brokerageForms,
                      selected1099BIndex,
                      (entry) => ({
                        ...entry,
                        transactions: entry.transactions.filter(
                          (_, index) => index !== selected1099BTransactionIndex,
                        ),
                      }),
                    ),
                  },
                },
          );
          setSelected1099BTransactionIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected broker transaction.");
          return;
        }
      }

      if (documentsPanel === "1099_g" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    unemploymentForms: [...current.documents.unemploymentForms, empty1099GEditorDraft()],
                  },
                },
          );
          setSelected1099GIndex(supplementalFederalDraft.documents.unemploymentForms.length);
          markDirty();
          setStatus("success", "Added a 1099-G draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.documents.unemploymentForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    unemploymentForms: current.documents.unemploymentForms.filter(
                      (_, index) => index !== selected1099GIndex,
                    ),
                  },
                },
          );
          setSelected1099GIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1099-G draft.");
          return;
        }
      }

      if (documentsPanel === "ssa_1099" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    socialSecurityForms: [...current.documents.socialSecurityForms, emptySsa1099EditorDraft()],
                  },
                },
          );
          setSelectedSsa1099Index(supplementalFederalDraft.documents.socialSecurityForms.length);
          markDirty();
          setStatus("success", "Added an SSA-1099 draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.documents.socialSecurityForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    socialSecurityForms: current.documents.socialSecurityForms.filter(
                      (_, index) => index !== selectedSsa1099Index,
                    ),
                  },
                },
          );
          setSelectedSsa1099Index((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected SSA-1099 draft.");
          return;
        }
      }

      if (documentsPanel === "1098" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    mortgageInterestForms: [...current.documents.mortgageInterestForms, empty1098EditorDraft()],
                  },
                },
          );
          setSelected1098Index(supplementalFederalDraft.documents.mortgageInterestForms.length);
          markDirty();
          setStatus("success", "Added a 1098 draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.documents.mortgageInterestForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    mortgageInterestForms: current.documents.mortgageInterestForms.filter(
                      (_, index) => index !== selected1098Index,
                    ),
                  },
                },
          );
          setSelected1098Index((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1098 draft.");
          return;
        }
      }

      if (documentsPanel === "1098_e" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    studentLoanForms: [...current.documents.studentLoanForms, empty1098EEditorDraft()],
                  },
                },
          );
          setSelected1098EIndex(supplementalFederalDraft.documents.studentLoanForms.length);
          markDirty();
          setStatus("success", "Added a 1098-E draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.documents.studentLoanForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    studentLoanForms: current.documents.studentLoanForms.filter(
                      (_, index) => index !== selected1098EIndex,
                    ),
                  },
                },
          );
          setSelected1098EIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1098-E draft.");
          return;
        }
      }

      if (documentsPanel === "1098_t" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    tuitionForms: [...current.documents.tuitionForms, empty1098TEditorDraft()],
                  },
                },
          );
          setSelected1098TIndex(supplementalFederalDraft.documents.tuitionForms.length);
          markDirty();
          setStatus("success", "Added a 1098-T draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.documents.tuitionForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    tuitionForms: current.documents.tuitionForms.filter(
                      (_, index) => index !== selected1098TIndex,
                    ),
                  },
                },
          );
          setSelected1098TIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1098-T draft.");
          return;
        }
      }

      if (documentsPanel === "1095_a" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    marketplaceForms: [...current.documents.marketplaceForms, empty1095AEditorDraft()],
                  },
                },
          );
          setSelected1095AIndex(supplementalFederalDraft.documents.marketplaceForms.length);
          setSelected1095AMonthlyRowIndex(0);
          markDirty();
          setStatus("success", "Added a 1095-A draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.documents.marketplaceForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    marketplaceForms: current.documents.marketplaceForms.filter(
                      (_, index) => index !== selected1095AIndex,
                    ),
                  },
                },
          );
          setSelected1095AIndex((current) => Math.max(current - 1, 0));
          setSelected1095AMonthlyRowIndex(0);
          markDirty();
          setStatus("success", "Removed the selected 1095-A draft.");
          return;
        }
      }

      if (documentsPanel === "1095_a" && focusIndex === 6) {
        const activeForm =
          supplementalFederalDraft.documents.marketplaceForms[selected1095AIndex] ?? null;

        if (key.name === "a" && activeForm != null) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    marketplaceForms: updateArrayEntry(
                      current.documents.marketplaceForms,
                      selected1095AIndex,
                      (entry) => ({
                        ...entry,
                        monthlyRows: [...entry.monthlyRows, emptyMarketplaceMonthlyRowEditorDraft()],
                      }),
                    ),
                  },
                },
          );
          setSelected1095AMonthlyRowIndex(activeForm.monthlyRows.length);
          markDirty();
          setStatus("success", "Added a 1095-A monthly row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          activeForm != null &&
          activeForm.monthlyRows.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  documents: {
                    ...current.documents,
                    marketplaceForms: updateArrayEntry(
                      current.documents.marketplaceForms,
                      selected1095AIndex,
                      (entry) => ({
                        ...entry,
                        monthlyRows: entry.monthlyRows.filter(
                          (_, index) => index !== selected1095AMonthlyRowIndex,
                        ),
                      }),
                    ),
                  },
                },
          );
          setSelected1095AMonthlyRowIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1095-A monthly row.");
          return;
        }
      }
    }

    if (activeStep === "supplemental_income" && supplementalFederalDraft != null) {
      if (supplementalIncomePanel === "1099_nec" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    necForms: [...current.supplementalIncome.necForms, empty1099NecEditorDraft()],
                  },
                },
          );
          setSelected1099NecIndex(supplementalFederalDraft.supplementalIncome.necForms.length);
          markDirty();
          setStatus("success", "Added a 1099-NEC draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.supplementalIncome.necForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    necForms: current.supplementalIncome.necForms.filter(
                      (_, index) => index !== selected1099NecIndex,
                    ),
                  },
                },
          );
          setSelected1099NecIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1099-NEC draft.");
          return;
        }
      }

      if (supplementalIncomePanel === "1099_misc" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    miscForms: [...current.supplementalIncome.miscForms, empty1099MiscEditorDraft()],
                  },
                },
          );
          setSelected1099MiscIndex(supplementalFederalDraft.supplementalIncome.miscForms.length);
          markDirty();
          setStatus("success", "Added a 1099-MISC draft.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.supplementalIncome.miscForms.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    miscForms: current.supplementalIncome.miscForms.filter(
                      (_, index) => index !== selected1099MiscIndex,
                    ),
                  },
                },
          );
          setSelected1099MiscIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1099-MISC draft.");
          return;
        }
      }

      if (supplementalIncomePanel === "schedule_c" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    scheduleCBusinesses: [
                      ...current.supplementalIncome.scheduleCBusinesses,
                      emptyScheduleCBusinessEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedScheduleCIndex(
            supplementalFederalDraft.supplementalIncome.scheduleCBusinesses.length,
          );
          markDirty();
          setStatus("success", "Added a Schedule C business.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.supplementalIncome.scheduleCBusinesses.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    scheduleCBusinesses:
                      current.supplementalIncome.scheduleCBusinesses.filter(
                        (_, index) => index !== selectedScheduleCIndex,
                      ),
                  },
                },
          );
          setSelectedScheduleCIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected Schedule C business.");
          return;
        }
      }

      if (supplementalIncomePanel === "schedule_e" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    scheduleEActivities: [
                      ...current.supplementalIncome.scheduleEActivities,
                      emptyScheduleEActivityEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedScheduleEIndex(
            supplementalFederalDraft.supplementalIncome.scheduleEActivities.length,
          );
          markDirty();
          setStatus("success", "Added a Schedule E activity.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.supplementalIncome.scheduleEActivities.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    scheduleEActivities:
                      current.supplementalIncome.scheduleEActivities.filter(
                        (_, index) => index !== selectedScheduleEIndex,
                      ),
                  },
                },
          );
          setSelectedScheduleEIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected Schedule E activity.");
          return;
        }
      }

      if (supplementalIncomePanel === "other_income" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    otherIncomeItems: [
                      ...current.supplementalIncome.otherIncomeItems,
                      emptyOtherIncomeItemEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedOtherIncomeIndex(
            supplementalFederalDraft.supplementalIncome.otherIncomeItems.length,
          );
          markDirty();
          setStatus("success", "Added an other-income row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.supplementalIncome.otherIncomeItems.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    otherIncomeItems:
                      current.supplementalIncome.otherIncomeItems.filter(
                        (_, index) => index !== selectedOtherIncomeIndex,
                      ),
                  },
                },
          );
          setSelectedOtherIncomeIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected other-income row.");
          return;
        }
      }

      if (supplementalIncomePanel === "withholdings" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    supplementalWithholdings: [
                      ...current.supplementalIncome.supplementalWithholdings,
                      emptySupplementalWithholdingEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedSupplementalWithholdingIndex(
            supplementalFederalDraft.supplementalIncome.supplementalWithholdings.length,
          );
          markDirty();
          setStatus("success", "Added a supplemental withholding row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.supplementalIncome.supplementalWithholdings.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  supplementalIncome: {
                    ...current.supplementalIncome,
                    supplementalWithholdings:
                      current.supplementalIncome.supplementalWithholdings.filter(
                        (_, index) => index !== selectedSupplementalWithholdingIndex,
                      ),
                  },
                },
          );
          setSelectedSupplementalWithholdingIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected supplemental withholding row.");
          return;
        }
      }
    }

    if (activeStep === "deductions" && supplementalFederalDraft != null) {
      if (deductionsPanel === "adjustments" && focusIndex === 12) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  deductions: {
                    ...current.deductions,
                    otherAdjustments: [...current.deductions.otherAdjustments, emptyNamedAmountEditorDraft()],
                  },
                },
          );
          setSelectedOtherAdjustmentIndex(supplementalFederalDraft.deductions.otherAdjustments.length);
          markDirty();
          setStatus("success", "Added an other-adjustment row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.deductions.otherAdjustments.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  deductions: {
                    ...current.deductions,
                    otherAdjustments: current.deductions.otherAdjustments.filter(
                      (_, index) => index !== selectedOtherAdjustmentIndex,
                    ),
                  },
                },
          );
          setSelectedOtherAdjustmentIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected other-adjustment row.");
          return;
        }
      }

      if (deductionsPanel === "itemized" && focusIndex === 9) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  deductions: {
                    ...current.deductions,
                    otherItemizedDeductions: [
                      ...current.deductions.otherItemizedDeductions,
                      emptyNamedAmountEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedOtherItemizedDeductionIndex(
            supplementalFederalDraft.deductions.otherItemizedDeductions.length,
          );
          markDirty();
          setStatus("success", "Added an other-itemized-deduction row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.deductions.otherItemizedDeductions.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  deductions: {
                    ...current.deductions,
                    otherItemizedDeductions:
                      current.deductions.otherItemizedDeductions.filter(
                        (_, index) => index !== selectedOtherItemizedDeductionIndex,
                      ),
                  },
                },
          );
          setSelectedOtherItemizedDeductionIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected other-itemized-deduction row.");
          return;
        }
      }
    }

    if (activeStep === "credits" && supplementalFederalDraft != null) {
      if (creditsPanel === "care_providers" && focusIndex === 2) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    careProviders: [...current.credits.careProviders, emptyCareProviderEditorDraft()],
                  },
                },
          );
          setSelectedCareProviderIndex(supplementalFederalDraft.credits.careProviders.length);
          markDirty();
          setStatus("success", "Added a care provider.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.credits.careProviders.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    careProviders: current.credits.careProviders.filter(
                      (_, index) => index !== selectedCareProviderIndex,
                    ),
                  },
                },
          );
          setSelectedCareProviderIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected care provider.");
          return;
        }
      }

      if (creditsPanel === "care_expenses" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    careExpenses: [...current.credits.careExpenses, emptyCareExpenseEditorDraft()],
                  },
                },
          );
          setSelectedCareExpenseIndex(supplementalFederalDraft.credits.careExpenses.length);
          markDirty();
          setStatus("success", "Added a care expense.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.credits.careExpenses.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    careExpenses: current.credits.careExpenses.filter(
                      (_, index) => index !== selectedCareExpenseIndex,
                    ),
                  },
                },
          );
          setSelectedCareExpenseIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected care expense.");
          return;
        }
      }

      if (creditsPanel === "energy" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    residentialCleanEnergyProjects: [
                      ...current.credits.residentialCleanEnergyProjects,
                      emptyEnergyProjectEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedEnergyProjectIndex(
            supplementalFederalDraft.credits.residentialCleanEnergyProjects.length,
          );
          markDirty();
          setStatus("success", "Added a clean-energy project.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.credits.residentialCleanEnergyProjects.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    residentialCleanEnergyProjects:
                      current.credits.residentialCleanEnergyProjects.filter(
                        (_, index) => index !== selectedEnergyProjectIndex,
                      ),
                  },
                },
          );
          setSelectedEnergyProjectIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected clean-energy project.");
          return;
        }
      }

      if (creditsPanel === "vehicles" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    cleanVehicleCredits: [
                      ...current.credits.cleanVehicleCredits,
                      emptyVehicleCreditEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedVehicleCreditIndex(supplementalFederalDraft.credits.cleanVehicleCredits.length);
          markDirty();
          setStatus("success", "Added a clean-vehicle credit claim.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.credits.cleanVehicleCredits.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    cleanVehicleCredits: current.credits.cleanVehicleCredits.filter(
                      (_, index) => index !== selectedVehicleCreditIndex,
                    ),
                  },
                },
          );
          setSelectedVehicleCreditIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected clean-vehicle credit claim.");
          return;
        }
      }

      if (creditsPanel === "other_credits" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    otherNonrefundableCredits: [
                      ...current.credits.otherNonrefundableCredits,
                      emptyNamedAmountEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedOtherNonrefundableCreditIndex(
            supplementalFederalDraft.credits.otherNonrefundableCredits.length,
          );
          markDirty();
          setStatus("success", "Added an other nonrefundable credit row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.credits.otherNonrefundableCredits.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    otherNonrefundableCredits:
                      current.credits.otherNonrefundableCredits.filter(
                        (_, index) => index !== selectedOtherNonrefundableCreditIndex,
                      ),
                  },
                },
          );
          setSelectedOtherNonrefundableCreditIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected other nonrefundable credit row.");
          return;
        }
      }

      if (creditsPanel === "other_credits" && focusIndex === 7) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    otherRefundableCredits: [
                      ...current.credits.otherRefundableCredits,
                      emptyNamedAmountEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedOtherRefundableCreditIndex(
            supplementalFederalDraft.credits.otherRefundableCredits.length,
          );
          markDirty();
          setStatus("success", "Added an other refundable credit row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.credits.otherRefundableCredits.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    otherRefundableCredits:
                      current.credits.otherRefundableCredits.filter(
                        (_, index) => index !== selectedOtherRefundableCreditIndex,
                      ),
                  },
                },
          );
          setSelectedOtherRefundableCreditIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected other refundable credit row.");
          return;
        }
      }

      if (creditsPanel === "hsa" && focusIndex === 1) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    hsaCoverageMonths: [...current.credits.hsaCoverageMonths, emptyHsaCoverageMonthEditorDraft()],
                  },
                },
          );
          setSelectedHsaCoverageIndex(supplementalFederalDraft.credits.hsaCoverageMonths.length);
          markDirty();
          setStatus("success", "Added an HSA coverage month.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.credits.hsaCoverageMonths.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  credits: {
                    ...current.credits,
                    hsaCoverageMonths: current.credits.hsaCoverageMonths.filter(
                      (_, index) => index !== selectedHsaCoverageIndex,
                    ),
                  },
                },
          );
          setSelectedHsaCoverageIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected HSA coverage month.");
          return;
        }
      }
    }

    if (activeStep === "overrides" && supplementalFederalDraft != null) {
      if (focusIndex === 0) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  overrides: {
                    ...current.overrides,
                    federalOverrides: [
                      ...current.overrides.federalOverrides,
                      { key: "", valueText: "" },
                    ],
                  },
                },
          );
          setSelectedFederalOverrideIndex(supplementalFederalDraft.overrides.federalOverrides.length);
          markDirty();
          setStatus("success", "Added a federal override row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.overrides.federalOverrides.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  overrides: {
                    ...current.overrides,
                    federalOverrides: current.overrides.federalOverrides.filter(
                      (_, index) => index !== selectedFederalOverrideIndex,
                    ),
                  },
                },
          );
          setSelectedFederalOverrideIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected federal override row.");
          return;
        }
      }

      if (focusIndex === 7) {
        if (key.name === "a") {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  overrides: {
                    ...current.overrides,
                    otherElections: [
                      ...current.overrides.otherElections,
                      emptyElectionChoiceEditorDraft(),
                    ],
                  },
                },
          );
          setSelectedOtherElectionIndex(supplementalFederalDraft.overrides.otherElections.length);
          markDirty();
          setStatus("success", "Added an election row.");
          return;
        }

        if (
          (key.name === "backspace" || key.name === "delete") &&
          supplementalFederalDraft.overrides.otherElections.length > 0
        ) {
          setSupplementalFederalDraft((current) =>
            current == null
              ? current
              : {
                  ...current,
                  overrides: {
                    ...current.overrides,
                    otherElections: current.overrides.otherElections.filter(
                      (_, index) => index !== selectedOtherElectionIndex,
                    ),
                  },
                },
          );
          setSelectedOtherElectionIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected election row.");
          return;
        }
      }
    }

    if (activeStep === "w2" && focusIndex === 0 && incomeDraft != null) {
      if (key.name === "a") {
        setIncomeDraft((current) => {
          const nextDraft = addBlankW2Draft(
            current ?? { w2s: [], interests: [], dividends: [], retirements: [] },
          );
          setSelectedW2Index(nextDraft.w2s.length - 1);
          return nextDraft;
        });
        markDirty();
        setStatus("success", "Added a W-2 draft.");
        return;
      }

      if ((key.name === "backspace" || key.name === "delete") && incomeDraft.w2s.length > 0) {
        const activeDocumentId = incomeDraft.w2s[selectedW2Index]?.documentId;

        if (activeDocumentId != null) {
          setIncomeDraft((current) =>
            current == null ? current : removeW2Draft(current, activeDocumentId));
          setSelectedW2Index((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected W-2 draft.");
        }
        return;
      }
    }

    if (activeStep === "interest" && focusIndex === 0 && incomeDraft != null) {
      if (key.name === "a") {
        setIncomeDraft((current) => {
          const nextDraft = addBlankInterestDraft(
            current ?? { w2s: [], interests: [], dividends: [], retirements: [] },
          );
          setSelectedInterestIndex(nextDraft.interests.length - 1);
          return nextDraft;
        });
        markDirty();
        setStatus("success", "Added a 1099-INT draft.");
        return;
      }

      if (
        (key.name === "backspace" || key.name === "delete") &&
        incomeDraft.interests.length > 0
      ) {
        const activeDocumentId = incomeDraft.interests[selectedInterestIndex]?.documentId;

        if (activeDocumentId != null) {
          setIncomeDraft((current) =>
            current == null ? current : removeInterestDraft(current, activeDocumentId));
          setSelectedInterestIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1099-INT draft.");
        }
      }
    }

    if (activeStep === "dividend" && focusIndex === 0 && incomeDraft != null) {
      if (key.name === "a") {
        setIncomeDraft((current) => {
          const nextDraft = addBlankDividendDraft(
            current ?? { w2s: [], interests: [], dividends: [], retirements: [] },
          );
          setSelectedDividendIndex((nextDraft.dividends ?? []).length - 1);
          return nextDraft;
        });
        markDirty();
        setStatus("success", "Added a 1099-DIV draft.");
        return;
      }

      if (
        (key.name === "backspace" || key.name === "delete") &&
        (incomeDraft.dividends ?? []).length > 0
      ) {
        const activeDocumentId = incomeDraft.dividends?.[selectedDividendIndex]?.documentId;

        if (activeDocumentId != null) {
          setIncomeDraft((current) =>
            current == null ? current : removeDividendDraft(current, activeDocumentId));
          setSelectedDividendIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1099-DIV draft.");
        }
        return;
      }
    }

    if (activeStep === "retirement" && focusIndex === 0 && incomeDraft != null) {
      if (key.name === "a") {
        setIncomeDraft((current) => {
          const nextDraft = addBlankRetirementDraft(
            current ?? { w2s: [], interests: [], dividends: [], retirements: [] },
          );
          setSelectedRetirementIndex((nextDraft.retirements ?? []).length - 1);
          return nextDraft;
        });
        markDirty();
        setStatus("success", "Added a 1099-R draft.");
        return;
      }

      if (
        (key.name === "backspace" || key.name === "delete") &&
        (incomeDraft.retirements ?? []).length > 0
      ) {
        const activeDocumentId =
          incomeDraft.retirements?.[selectedRetirementIndex]?.documentId;

        if (activeDocumentId != null) {
          setIncomeDraft((current) =>
            current == null ? current : removeRetirementDraft(current, activeDocumentId));
          setSelectedRetirementIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected 1099-R draft.");
        }
        return;
      }
    }

    if (activeStep === "payments" && paymentsDraft != null) {
      if (focusIndex <= 3 && key.name === "a") {
        setPaymentsDraft((current) => {
          const nextDraft = addBlankEstimatedPayment(current ?? emptyPaymentsDraft());
          setSelectedEstimatedPaymentIndex(nextDraft.estimatedPayments.length - 1);
          return nextDraft;
        });
        markDirty();
        setStatus("success", "Added an estimated payment.");
        return;
      }

      if (
        focusIndex <= 3 &&
        (key.name === "backspace" || key.name === "delete") &&
        paymentsDraft.estimatedPayments.length > 0
      ) {
        const activePaymentId =
          paymentsDraft.estimatedPayments[selectedEstimatedPaymentIndex]?.paymentId;

        if (activePaymentId != null) {
          setPaymentsDraft((current) =>
            current == null ? current : removeEstimatedPayment(current, activePaymentId));
          setSelectedEstimatedPaymentIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected estimated payment.");
        }
        return;
      }

      if (focusIndex >= 4 && focusIndex <= 7 && key.name === "a") {
        setPaymentsDraft((current) => {
          const nextDraft = addBlankExtensionPayment(current ?? emptyPaymentsDraft());
          setSelectedExtensionPaymentIndex(nextDraft.extensionPayments.length - 1);
          return nextDraft;
        });
        markDirty();
        setStatus("success", "Added an extension payment.");
        return;
      }

      if (
        focusIndex >= 4 &&
        focusIndex <= 7 &&
        (key.name === "backspace" || key.name === "delete") &&
        paymentsDraft.extensionPayments.length > 0
      ) {
        const activePaymentId =
          paymentsDraft.extensionPayments[selectedExtensionPaymentIndex]?.extensionPaymentId;

        if (activePaymentId != null) {
          setPaymentsDraft((current) =>
            current == null ? current : removeExtensionPayment(current, activePaymentId));
          setSelectedExtensionPaymentIndex((current) => Math.max(current - 1, 0));
          markDirty();
          setStatus("success", "Removed the selected extension payment.");
        }
        return;
      }
    }
  });

  return (
    <box flexDirection="column" padding={1} gap={1} backgroundColor="#081611">
      <box flexDirection="column">
        <ascii-font font="tiny" text="TaxZilla" />
        <text attributes={TextAttributes.DIM}>Federal TY2025 shell</text>
      </box>

      <box
        flexDirection={isWide ? "row" : "column"}
        gap={1}
        flexGrow={1}
      >
        <box
          border
          borderStyle="rounded"
          title="Navigator"
          width={isWide ? 38 : undefined}
          padding={1}
          flexDirection="column"
          gap={1}
          backgroundColor="#0d221a"
        >
          <StepList activeStep={activeStep} />
          <SessionSummary
            efileDraft={efileDraft}
            incomeDraft={incomeDraft}
            paymentsDraft={paymentsDraft}
            pathInput={pathInput}
            session={session}
            dirty={dirty}
            busyLabel={busyLabel}
            statusMessage={statusMessage}
          />
        </box>

        <box
          border
          borderStyle="rounded"
          title={titleForStep(activeStep)}
          flexGrow={1}
          padding={1}
          flexDirection="column"
          gap={1}
          backgroundColor="#102821"
        >
          {renderStep({
            activeStep,
            createFilingStatus,
            createRequestedStatesInput,
            creditsPanel,
            deductionsPanel,
            documentsPanel,
            exportOutputDir,
            exportPresetId,
            exportState,
            familyPanel,
            focusIndex,
            efileDraft,
            householdDraft,
            incomeDraft,
            paymentsDraft,
            pathInput,
            personDirectory,
            resultState,
            supplementalFederalDraft,
            supplementalIncomePanel,
            selectedDividendIndex,
            selectedDependentIndex,
            selectedEstimatedPaymentIndex,
            selected1095AIndex,
            selected1095AMonthlyRowIndex,
            selected1098EIndex,
            selected1098Index,
            selected1098TIndex,
            selected1099BIndex,
            selected1099BTransactionIndex,
            selected1099GIndex,
            selected1099MiscIndex,
            selected1099NecIndex,
            selectedInterestIndex,
            selectedFederalOverrideIndex,
            selectedCareExpenseIndex,
            selectedCareProviderIndex,
            selectedEnergyProjectIndex,
            selectedExtensionPaymentIndex,
            selectedHsaCoverageIndex,
            selectedOtherAdjustmentIndex,
            selectedOtherElectionIndex,
            selectedOtherIncomeIndex,
            selectedOtherItemizedDeductionIndex,
            selectedOtherNonrefundableCreditIndex,
            selectedOtherRefundableCreditIndex,
            selectedRetirementIndex,
            selectedScheduleCIndex,
            selectedScheduleEIndex,
            selectedSsa1099Index,
            selectedSupplementalWithholdingIndex,
            selectedVehicleCreditIndex,
            selectedW2Index,
            session,
            setCreateFilingStatus,
            setCreateRequestedStatesInput,
            setCreditsPanel,
            setDeductionsPanel,
            setDocumentsPanel,
            setEfileDraft,
            setExportOutputDir,
            setExportPresetId,
            setFamilyPanel,
            setHouseholdDraft,
            setIncomeDraft,
            setPathInput,
            setPaymentsDraft,
            setSupplementalFederalDraft,
            setSelectedDividendIndex,
            setSelectedDependentIndex,
            setSelectedEstimatedPaymentIndex,
            setSelected1095AIndex,
            setSelected1095AMonthlyRowIndex,
            setSelected1098EIndex,
            setSelected1098Index,
            setSelected1098TIndex,
            setSelected1099BIndex,
            setSelected1099BTransactionIndex,
            setSelected1099GIndex,
            setSelected1099MiscIndex,
            setSelected1099NecIndex,
            setSelectedExtensionPaymentIndex,
            setSelectedFederalOverrideIndex,
            setSelectedCareExpenseIndex,
            setSelectedCareProviderIndex,
            setSelectedEnergyProjectIndex,
            setSelectedHsaCoverageIndex,
            setSelectedInterestIndex,
            setSelectedOtherAdjustmentIndex,
            setSelectedOtherElectionIndex,
            setSelectedOtherIncomeIndex,
            setSelectedOtherItemizedDeductionIndex,
            setSelectedOtherNonrefundableCreditIndex,
            setSelectedOtherRefundableCreditIndex,
            setSelectedRetirementIndex,
            setSelectedScheduleCIndex,
            setSelectedScheduleEIndex,
            setSelectedSsa1099Index,
            setSelectedSupplementalWithholdingIndex,
            setSelectedVehicleCreditIndex,
            setSelectedW2Index,
            setStatus,
            setSupplementalIncomePanel,
            markDirty,
          })}
        </box>
      </box>

      <box border padding={1} flexDirection="column" backgroundColor="#0b1e18">
        <text>`ctrl+n` new  `ctrl+o` open  `ctrl+s` save</text>
        <text>`a` add form or payment  `backspace` remove list item  `ctrl+r` run  `ctrl+e` export</text>
        <text>`pageup` `pagedown` step  `tab` field  `escape` quit</text>
      </box>
    </box>
  );
}

function renderStep(options: {
  readonly activeStep: StepId;
  readonly createFilingStatus: SupportedFilingStatus;
  readonly createRequestedStatesInput: string;
  readonly creditsPanel:
    | "candidates"
    | "care_providers"
    | "care_expenses"
    | "energy"
    | "vehicles"
    | "other_credits"
    | "hsa";
  readonly deductionsPanel: "adjustments" | "itemized";
  readonly documentsPanel:
    | "1099_b"
    | "1099_g"
    | "ssa_1099"
    | "1098"
    | "1098_e"
    | "1098_t"
    | "1095_a";
  readonly exportOutputDir: string;
  readonly exportPresetId: ExportPresetId;
  readonly exportState: ExportState;
  readonly familyPanel: "taxpayer" | "spouse" | "dependents";
  readonly focusIndex: number;
  readonly efileDraft: EfileDraft | null;
  readonly householdDraft: HouseholdDraft | null;
  readonly incomeDraft: IncomeDraft | null;
  readonly paymentsDraft: PaymentsDraft | null;
  readonly pathInput: string;
  readonly personDirectory: ReadonlyArray<ReturnType<typeof buildPersonDirectory>[number]>;
  readonly resultState: ResultState;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly supplementalIncomePanel:
    | "1099_nec"
    | "1099_misc"
    | "schedule_c"
    | "schedule_e"
    | "other_income"
    | "withholdings";
  readonly selectedDividendIndex: number;
  readonly selectedDependentIndex: number;
  readonly selectedEstimatedPaymentIndex: number;
  readonly selected1095AIndex: number;
  readonly selected1095AMonthlyRowIndex: number;
  readonly selected1098EIndex: number;
  readonly selected1098Index: number;
  readonly selected1098TIndex: number;
  readonly selected1099BIndex: number;
  readonly selected1099BTransactionIndex: number;
  readonly selected1099GIndex: number;
  readonly selected1099MiscIndex: number;
  readonly selected1099NecIndex: number;
  readonly selectedExtensionPaymentIndex: number;
  readonly selectedInterestIndex: number;
  readonly selectedFederalOverrideIndex: number;
  readonly selectedCareExpenseIndex: number;
  readonly selectedCareProviderIndex: number;
  readonly selectedEnergyProjectIndex: number;
  readonly selectedHsaCoverageIndex: number;
  readonly selectedOtherAdjustmentIndex: number;
  readonly selectedOtherElectionIndex: number;
  readonly selectedOtherIncomeIndex: number;
  readonly selectedOtherItemizedDeductionIndex: number;
  readonly selectedOtherNonrefundableCreditIndex: number;
  readonly selectedOtherRefundableCreditIndex: number;
  readonly selectedRetirementIndex: number;
  readonly selectedScheduleCIndex: number;
  readonly selectedScheduleEIndex: number;
  readonly selectedSsa1099Index: number;
  readonly selectedSupplementalWithholdingIndex: number;
  readonly selectedVehicleCreditIndex: number;
  readonly selectedW2Index: number;
  readonly session: InteractiveSession | null;
  readonly setCreateFilingStatus: (value: SupportedFilingStatus) => void;
  readonly setCreateRequestedStatesInput: (value: string) => void;
  readonly setCreditsPanel: (
    value:
      | "candidates"
      | "care_providers"
      | "care_expenses"
      | "energy"
      | "vehicles"
      | "other_credits"
      | "hsa",
  ) => void;
  readonly setDeductionsPanel: (value: "adjustments" | "itemized") => void;
  readonly setDocumentsPanel: (
    value:
      | "1099_b"
      | "1099_g"
      | "ssa_1099"
      | "1098"
      | "1098_e"
      | "1098_t"
      | "1095_a",
  ) => void;
  readonly setEfileDraft: StateSetter<EfileDraft | null>;
  readonly setExportOutputDir: (value: string) => void;
  readonly setExportPresetId: (value: ExportPresetId) => void;
  readonly setFamilyPanel: (value: "taxpayer" | "spouse" | "dependents") => void;
  readonly setHouseholdDraft: StateSetter<HouseholdDraft | null>;
  readonly setIncomeDraft: StateSetter<IncomeDraft | null>;
  readonly setPathInput: (value: string) => void;
  readonly setPaymentsDraft: StateSetter<PaymentsDraft | null>;
  readonly setSupplementalFederalDraft: StateSetter<InteractiveSupplementalFederalDraft | null>;
  readonly setSelectedDividendIndex: (value: number) => void;
  readonly setSelectedDependentIndex: (value: number) => void;
  readonly setSelectedEstimatedPaymentIndex: (value: number) => void;
  readonly setSelected1095AIndex: (value: number) => void;
  readonly setSelected1095AMonthlyRowIndex: (value: number) => void;
  readonly setSelected1098EIndex: (value: number) => void;
  readonly setSelected1098Index: (value: number) => void;
  readonly setSelected1098TIndex: (value: number) => void;
  readonly setSelected1099BIndex: (value: number) => void;
  readonly setSelected1099BTransactionIndex: (value: number) => void;
  readonly setSelected1099GIndex: (value: number) => void;
  readonly setSelected1099MiscIndex: (value: number) => void;
  readonly setSelected1099NecIndex: (value: number) => void;
  readonly setSelectedExtensionPaymentIndex: (value: number) => void;
  readonly setSelectedFederalOverrideIndex: (value: number) => void;
  readonly setSelectedCareExpenseIndex: (value: number) => void;
  readonly setSelectedCareProviderIndex: (value: number) => void;
  readonly setSelectedEnergyProjectIndex: (value: number) => void;
  readonly setSelectedHsaCoverageIndex: (value: number) => void;
  readonly setSelectedInterestIndex: (value: number) => void;
  readonly setSelectedOtherAdjustmentIndex: (value: number) => void;
  readonly setSelectedOtherElectionIndex: (value: number) => void;
  readonly setSelectedOtherIncomeIndex: (value: number) => void;
  readonly setSelectedOtherItemizedDeductionIndex: (value: number) => void;
  readonly setSelectedOtherNonrefundableCreditIndex: (value: number) => void;
  readonly setSelectedOtherRefundableCreditIndex: (value: number) => void;
  readonly setSelectedRetirementIndex: (value: number) => void;
  readonly setSelectedScheduleCIndex: (value: number) => void;
  readonly setSelectedScheduleEIndex: (value: number) => void;
  readonly setSelectedSsa1099Index: (value: number) => void;
  readonly setSelectedSupplementalWithholdingIndex: (value: number) => void;
  readonly setSelectedVehicleCreditIndex: (value: number) => void;
  readonly setSelectedW2Index: (value: number) => void;
  readonly setStatus: (tone: StatusTone, text: string) => void;
  readonly setSupplementalIncomePanel: (
    value:
      | "1099_nec"
      | "1099_misc"
      | "schedule_c"
      | "schedule_e"
      | "other_income"
      | "withholdings",
  ) => void;
  readonly markDirty: () => void;
}) {
  switch (options.activeStep) {
    case "session":
      return (
        <SessionStep
          createFilingStatus={options.createFilingStatus}
          createRequestedStatesInput={options.createRequestedStatesInput}
          focusIndex={options.focusIndex}
          pathInput={options.pathInput}
          setCreateFilingStatus={options.setCreateFilingStatus}
          setCreateRequestedStatesInput={options.setCreateRequestedStatesInput}
          setPathInput={options.setPathInput}
          session={options.session}
        />
      );
    case "household":
      return (
        <HouseholdStep
          focusIndex={options.focusIndex}
          householdDraft={options.householdDraft}
          setHouseholdDraft={options.setHouseholdDraft}
          markDirty={options.markDirty}
          setStatus={options.setStatus}
        />
      );
    case "family":
      return (
        <FamilyStep
          familyPanel={options.familyPanel}
          focusIndex={options.focusIndex}
          householdDraft={options.householdDraft}
          personDirectory={options.personDirectory}
          supplementalFederalDraft={options.supplementalFederalDraft}
          selectedDependentIndex={options.selectedDependentIndex}
          setFamilyPanel={options.setFamilyPanel}
          setSelectedDependentIndex={options.setSelectedDependentIndex}
          setSupplementalFederalDraft={options.setSupplementalFederalDraft}
          markDirty={options.markDirty}
        />
      );
    case "documents":
      return (
        <AdditionalDocumentsStep
          documentsPanel={options.documentsPanel}
          focusIndex={options.focusIndex}
          personDirectory={options.personDirectory}
          supplementalFederalDraft={options.supplementalFederalDraft}
          selected1095AIndex={options.selected1095AIndex}
          selected1095AMonthlyRowIndex={options.selected1095AMonthlyRowIndex}
          selected1098EIndex={options.selected1098EIndex}
          selected1098Index={options.selected1098Index}
          selected1098TIndex={options.selected1098TIndex}
          selected1099BIndex={options.selected1099BIndex}
          selected1099BTransactionIndex={options.selected1099BTransactionIndex}
          selected1099GIndex={options.selected1099GIndex}
          selectedSsa1099Index={options.selectedSsa1099Index}
          setDocumentsPanel={options.setDocumentsPanel}
          setSelected1095AIndex={options.setSelected1095AIndex}
          setSelected1095AMonthlyRowIndex={options.setSelected1095AMonthlyRowIndex}
          setSelected1098EIndex={options.setSelected1098EIndex}
          setSelected1098Index={options.setSelected1098Index}
          setSelected1098TIndex={options.setSelected1098TIndex}
          setSelected1099BIndex={options.setSelected1099BIndex}
          setSelected1099BTransactionIndex={options.setSelected1099BTransactionIndex}
          setSelected1099GIndex={options.setSelected1099GIndex}
          setSelectedSsa1099Index={options.setSelectedSsa1099Index}
          setSupplementalFederalDraft={options.setSupplementalFederalDraft}
          markDirty={options.markDirty}
        />
      );
    case "supplemental_income":
      return (
        <SupplementalIncomeStep
          focusIndex={options.focusIndex}
          supplementalFederalDraft={options.supplementalFederalDraft}
          supplementalIncomePanel={options.supplementalIncomePanel}
          selected1099MiscIndex={options.selected1099MiscIndex}
          selected1099NecIndex={options.selected1099NecIndex}
          selectedOtherIncomeIndex={options.selectedOtherIncomeIndex}
          selectedScheduleCIndex={options.selectedScheduleCIndex}
          selectedScheduleEIndex={options.selectedScheduleEIndex}
          selectedSupplementalWithholdingIndex={options.selectedSupplementalWithholdingIndex}
          setSelected1099MiscIndex={options.setSelected1099MiscIndex}
          setSelected1099NecIndex={options.setSelected1099NecIndex}
          setSelectedOtherIncomeIndex={options.setSelectedOtherIncomeIndex}
          setSelectedScheduleCIndex={options.setSelectedScheduleCIndex}
          setSelectedScheduleEIndex={options.setSelectedScheduleEIndex}
          setSelectedSupplementalWithholdingIndex={options.setSelectedSupplementalWithholdingIndex}
          setSupplementalIncomePanel={options.setSupplementalIncomePanel}
          setSupplementalFederalDraft={options.setSupplementalFederalDraft}
          markDirty={options.markDirty}
        />
      );
    case "deductions":
      return (
        <DeductionsStep
          deductionsPanel={options.deductionsPanel}
          focusIndex={options.focusIndex}
          supplementalFederalDraft={options.supplementalFederalDraft}
          selectedOtherAdjustmentIndex={options.selectedOtherAdjustmentIndex}
          selectedOtherItemizedDeductionIndex={options.selectedOtherItemizedDeductionIndex}
          setDeductionsPanel={options.setDeductionsPanel}
          setSelectedOtherAdjustmentIndex={options.setSelectedOtherAdjustmentIndex}
          setSelectedOtherItemizedDeductionIndex={options.setSelectedOtherItemizedDeductionIndex}
          setSupplementalFederalDraft={options.setSupplementalFederalDraft}
          markDirty={options.markDirty}
        />
      );
    case "credits":
      return (
        <CreditsStep
          creditsPanel={options.creditsPanel}
          focusIndex={options.focusIndex}
          personDirectory={options.personDirectory}
          supplementalFederalDraft={options.supplementalFederalDraft}
          selectedCareExpenseIndex={options.selectedCareExpenseIndex}
          selectedCareProviderIndex={options.selectedCareProviderIndex}
          selectedEnergyProjectIndex={options.selectedEnergyProjectIndex}
          selectedHsaCoverageIndex={options.selectedHsaCoverageIndex}
          selectedOtherNonrefundableCreditIndex={options.selectedOtherNonrefundableCreditIndex}
          selectedOtherRefundableCreditIndex={options.selectedOtherRefundableCreditIndex}
          selectedVehicleCreditIndex={options.selectedVehicleCreditIndex}
          setCreditsPanel={options.setCreditsPanel}
          setSelectedCareExpenseIndex={options.setSelectedCareExpenseIndex}
          setSelectedCareProviderIndex={options.setSelectedCareProviderIndex}
          setSelectedEnergyProjectIndex={options.setSelectedEnergyProjectIndex}
          setSelectedHsaCoverageIndex={options.setSelectedHsaCoverageIndex}
          setSelectedOtherNonrefundableCreditIndex={
            options.setSelectedOtherNonrefundableCreditIndex
          }
          setSelectedOtherRefundableCreditIndex={options.setSelectedOtherRefundableCreditIndex}
          setSelectedVehicleCreditIndex={options.setSelectedVehicleCreditIndex}
          setSupplementalFederalDraft={options.setSupplementalFederalDraft}
          markDirty={options.markDirty}
        />
      );
    case "overrides":
      return (
        <OverridesStep
          focusIndex={options.focusIndex}
          supplementalFederalDraft={options.supplementalFederalDraft}
          selectedFederalOverrideIndex={options.selectedFederalOverrideIndex}
          selectedOtherElectionIndex={options.selectedOtherElectionIndex}
          setSelectedFederalOverrideIndex={options.setSelectedFederalOverrideIndex}
          setSelectedOtherElectionIndex={options.setSelectedOtherElectionIndex}
          setSupplementalFederalDraft={options.setSupplementalFederalDraft}
          markDirty={options.markDirty}
        />
      );
    case "w2":
      return (
        <W2Step
          focusIndex={options.focusIndex}
          incomeDraft={options.incomeDraft}
          selectedW2Index={options.selectedW2Index}
          setIncomeDraft={options.setIncomeDraft}
          setSelectedW2Index={options.setSelectedW2Index}
          markDirty={options.markDirty}
        />
      );
    case "interest":
      return (
        <InterestStep
          focusIndex={options.focusIndex}
          incomeDraft={options.incomeDraft}
          selectedInterestIndex={options.selectedInterestIndex}
          setIncomeDraft={options.setIncomeDraft}
          setSelectedInterestIndex={options.setSelectedInterestIndex}
          markDirty={options.markDirty}
        />
      );
    case "dividend":
      return (
        <DividendStep
          focusIndex={options.focusIndex}
          incomeDraft={options.incomeDraft}
          selectedDividendIndex={options.selectedDividendIndex}
          setIncomeDraft={options.setIncomeDraft}
          setSelectedDividendIndex={options.setSelectedDividendIndex}
          markDirty={options.markDirty}
        />
      );
    case "retirement":
      return (
        <RetirementStep
          focusIndex={options.focusIndex}
          incomeDraft={options.incomeDraft}
          selectedRetirementIndex={options.selectedRetirementIndex}
          setIncomeDraft={options.setIncomeDraft}
          setSelectedRetirementIndex={options.setSelectedRetirementIndex}
          markDirty={options.markDirty}
        />
      );
    case "payments":
      return (
        <PaymentsStep
          focusIndex={options.focusIndex}
          paymentsDraft={options.paymentsDraft}
          selectedEstimatedPaymentIndex={options.selectedEstimatedPaymentIndex}
          selectedExtensionPaymentIndex={options.selectedExtensionPaymentIndex}
          setPaymentsDraft={options.setPaymentsDraft}
          setSelectedEstimatedPaymentIndex={options.setSelectedEstimatedPaymentIndex}
          setSelectedExtensionPaymentIndex={options.setSelectedExtensionPaymentIndex}
          markDirty={options.markDirty}
        />
      );
    case "banking":
      return (
        <BankingStep
          focusIndex={options.focusIndex}
          paymentsDraft={options.paymentsDraft}
          setPaymentsDraft={options.setPaymentsDraft}
          markDirty={options.markDirty}
        />
      );
    case "efile":
      return (
        <EfileStep
          efileDraft={options.efileDraft}
          focusIndex={options.focusIndex}
          setEfileDraft={options.setEfileDraft}
          markDirty={options.markDirty}
        />
      );
    case "results":
      return <ResultsStep resultState={options.resultState} session={options.session} />;
    case "export":
      return (
        <ExportStep
          exportOutputDir={options.exportOutputDir}
          exportPresetId={options.exportPresetId}
          exportState={options.exportState}
          focusIndex={options.focusIndex}
          setExportOutputDir={options.setExportOutputDir}
          setExportPresetId={options.setExportPresetId}
          session={options.session}
        />
      );
    default:
      return <text>Unknown step.</text>;
  }
}

function StepList(props: { readonly activeStep: StepId }) {
  return (
    <box border padding={1} flexDirection="column">
      <text>Workflow</text>
      {stepIds.map((stepId, index) => (
        <text key={stepId}>
          {props.activeStep === stepId ? ">" : " "} {index + 1}. {titleForStep(stepId)}
        </text>
      ))}
    </box>
  );
}

function SessionSummary(props: {
  readonly efileDraft: EfileDraft | null;
  readonly incomeDraft: IncomeDraft | null;
  readonly paymentsDraft: PaymentsDraft | null;
  readonly pathInput: string;
  readonly session: InteractiveSession | null;
  readonly dirty: boolean;
  readonly busyLabel: string | null;
  readonly statusMessage: { readonly tone: StatusTone; readonly text: string } | null;
}) {
  return (
    <box border padding={1} flexDirection="column" gap={1}>
      <text>Session</text>
      <text>Input: {props.pathInput.length > 0 ? truncateMiddle(props.pathInput, 40) : "(empty)"}</text>
      <text>
        Loaded: {props.session == null ? "none" : truncateMiddle(props.session.sessionDir, 40)}
      </text>
      <text>
        Requested states: {props.session == null
          ? "none"
          : formatRequestedStateCodes(props.session.canonicalReturn.requested_jurisdictions.states)}
      </text>
      <text>
        Forms: W-2 {props.incomeDraft?.w2s.length ?? 0} / INT {props.incomeDraft?.interests.length ?? 0} / DIV {props.incomeDraft?.dividends?.length ?? 0} / 1099-R {props.incomeDraft?.retirements?.length ?? 0}
      </text>
      <text>
        Payments: est {props.paymentsDraft?.estimatedPayments.length ?? 0} / ext {props.paymentsDraft?.extensionPayments.length ?? 0}
      </text>
      <text>
        Banking: refund {props.paymentsDraft?.refundDirectDepositEnabled ? "on" : "off"} / debit {props.paymentsDraft?.balanceDueDirectDebitEnabled ? "on" : "off"}
      </text>
      <text>
        E-file: {props.efileDraft == null ? "unset" : formatSignatureMethod(props.efileDraft.signatureMethod)}
      </text>
      <text>Dirty edits: {props.dirty ? "yes" : "no"}</text>
      <text>Busy: {props.busyLabel ?? "idle"}</text>
      <text>
        Status: {props.statusMessage == null ? "none" : truncateMiddle(props.statusMessage.text, 40)}
      </text>
    </box>
  );
}

function SessionStep(props: {
  readonly createFilingStatus: SupportedFilingStatus;
  readonly createRequestedStatesInput: string;
  readonly focusIndex: number;
  readonly pathInput: string;
  readonly setCreateFilingStatus: (value: SupportedFilingStatus) => void;
  readonly setCreateRequestedStatesInput: (value: string) => void;
  readonly setPathInput: (value: string) => void;
  readonly session: InteractiveSession | null;
}) {
  return (
    <box flexDirection="column" gap={1}>
      <text>Create: `ctrl+n`.</text>
      <text>Open: `ctrl+o`.</text>
      <text>Default path: `.taxzilla/returns/&lt;return-id&gt;`.</text>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>Session path</text>
        <input
          value={props.pathInput}
          onChange={props.setPathInput}
          focused={props.focusIndex === 0}
          placeholder="session dir or canonical-return.json"
          width="100%"
        />
      </box>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>New-session filing status</text>
        <select
          options={filingStatusOptions}
          height={5}
          selectedIndex={filingStatusIndex(props.createFilingStatus)}
          onChange={(_, option) => {
            if (typeof option?.value === "string") {
              props.setCreateFilingStatus(option.value as SupportedFilingStatus);
            }
          }}
          focused={props.focusIndex === 1}
        />
      </box>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>New-session requested states</text>
        <input
          value={props.createRequestedStatesInput}
          onChange={props.setCreateRequestedStatesInput}
          focused={props.focusIndex === 2}
          placeholder="optional USPS codes, e.g. CA, NY"
          width="100%"
        />
      </box>

      {props.session == null ? (
        <box border padding={1}>
          <text>No session loaded yet.</text>
        </box>
      ) : (
        <box border padding={1} flexDirection="column">
          <text>Return ID: {props.session.canonicalReturn.return_id}</text>
          <text>Canonical: {truncateMiddle(props.session.canonicalPath, 56)}</text>
          <text>
            Requested states: {formatRequestedStateCodes(
              props.session.canonicalReturn.requested_jurisdictions.states,
            )}
          </text>
        </box>
      )}
    </box>
  );
}

function HouseholdStep(props: {
  readonly focusIndex: number;
  readonly householdDraft: HouseholdDraft | null;
  readonly setHouseholdDraft: (
    value: HouseholdDraft | ((current: HouseholdDraft | null) => HouseholdDraft | null),
  ) => void;
  readonly markDirty: () => void;
  readonly setStatus: (tone: StatusTone, text: string) => void;
}) {
  if (props.householdDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit household details.</text>
      </box>
    );
  }

  const updateDraft = <K extends keyof HouseholdDraft>(key: K, value: HouseholdDraft[K]) => {
    props.setHouseholdDraft((current) => {
      if (current == null) {
        return current;
      }

      return {
        ...current,
        [key]: value,
      };
    });
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>Edit the core filing fields, then press `ctrl+s`.</text>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>Filing status</text>
        <select
          options={filingStatusOptions}
          height={5}
          selectedIndex={filingStatusIndex(props.householdDraft.filingStatus)}
          onChange={(_, option) => {
            if (typeof option?.value === "string") {
              updateDraft("filingStatus", option.value as SupportedFilingStatus);
            }
          }}
          focused={props.focusIndex === 0}
        />
      </box>

      <FieldRow
        focused={props.focusIndex === 1}
        label="First name"
        onChange={(value) => updateDraft("firstName", value)}
        value={props.householdDraft.firstName}
      />
      <FieldRow
        focused={props.focusIndex === 2}
        label="Last name"
        onChange={(value) => updateDraft("lastName", value)}
        value={props.householdDraft.lastName}
      />
      <FieldRow
        focused={props.focusIndex === 3}
        label="Full legal name"
        onChange={(value) => updateDraft("fullLegalName", value)}
        value={props.householdDraft.fullLegalName}
      />
      <FieldRow
        focused={props.focusIndex === 4}
        label="Email"
        onChange={(value) => updateDraft("email", value)}
        value={props.householdDraft.email}
      />
      <FieldRow
        focused={props.focusIndex === 5}
        label="Phone"
        onChange={(value) => updateDraft("phone", value)}
        value={props.householdDraft.phone}
      />

      {props.householdDraft.fullLegalName.trim().length === 0 ? (
        <text attributes={TextAttributes.DIM}>
          Tip: add the full legal name before export review.
        </text>
      ) : null}
    </box>
  );
}

function FamilyStep(props: {
  readonly familyPanel: "taxpayer" | "spouse" | "dependents";
  readonly focusIndex: number;
  readonly householdDraft: HouseholdDraft | null;
  readonly personDirectory: ReadonlyArray<ReturnType<typeof buildPersonDirectory>[number]>;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly selectedDependentIndex: number;
  readonly setFamilyPanel: (value: "taxpayer" | "spouse" | "dependents") => void;
  readonly setSelectedDependentIndex: (value: number) => void;
  readonly setSupplementalFederalDraft: StateSetter<InteractiveSupplementalFederalDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.supplementalFederalDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit family and taxpayer supplement details.</text>
      </box>
    );
  }

  const family = props.supplementalFederalDraft.family;
  const activeDependent = family.dependents[props.selectedDependentIndex] ?? null;

  const updateFamily = (
    updater: (
      draft: InteractiveSupplementalFederalDraft["family"],
    ) => InteractiveSupplementalFederalDraft["family"],
  ) => {
    props.setSupplementalFederalDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            family: updater(current.family),
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>
        Edit taxpayer supplement data, spouse details, and dependent eligibility without dropping
        into raw JSON.
      </text>
      <SelectFieldRow
        focused={props.focusIndex === 0}
        label="Family section"
        onChange={props.setFamilyPanel}
        options={familyPanelOptions}
        value={props.familyPanel}
      />

      {props.familyPanel === "taxpayer" ? (
        <box flexDirection="column" gap={1}>
          <text attributes={TextAttributes.DIM}>
            Taxpayer name stays in Household. This section only captures the supplemental federal
            fields the engine relies on.
          </text>
          <SlimFieldRow
            focused={props.focusIndex === 1}
            label="Date of birth"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                taxpayer: {
                  ...current.taxpayer,
                  dateOfBirth: value,
                },
              }))
            }
            value={family.taxpayer.dateOfBirth}
          />
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Tax ID token"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                taxpayer: {
                  ...current.taxpayer,
                  taxIdToken: value,
                },
              }))
            }
            value={family.taxpayer.taxIdToken}
          />
          <SlimFieldRow
            focused={props.focusIndex === 3}
            label="Last 4 tax ID"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                taxpayer: {
                  ...current.taxpayer,
                  last4TaxId: value,
                },
              }))
            }
            value={family.taxpayer.last4TaxId}
          />
          <SlimFieldRow
            focused={props.focusIndex === 4}
            label="Citizenship status"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                taxpayer: {
                  ...current.taxpayer,
                  citizenshipStatus: value,
                },
              }))
            }
            value={family.taxpayer.citizenshipStatus}
          />
          <BooleanSelectRow
            focused={props.focusIndex === 5}
            label="Taxpayer is blind"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                taxpayer: {
                  ...current.taxpayer,
                  isBlind: value,
                },
              }))
            }
            value={family.taxpayer.isBlind}
          />
          <BooleanSelectRow
            focused={props.focusIndex === 6}
            label="Taxpayer is full-time student"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                taxpayer: {
                  ...current.taxpayer,
                  isFullTimeStudent: value,
                },
              }))
            }
            value={family.taxpayer.isFullTimeStudent}
          />
          <SlimFieldRow
            focused={props.focusIndex === 7}
            label="Occupation"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                taxpayer: {
                  ...current.taxpayer,
                  occupation: value,
                },
              }))
            }
            value={family.taxpayer.occupation}
          />
          <BooleanSelectRow
            focused={props.focusIndex === 8}
            label="Can be claimed as a dependent"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                canBeClaimedAsDependent: value,
              }))
            }
            value={family.canBeClaimedAsDependent}
          />
        </box>
      ) : null}

      {props.familyPanel === "spouse" ? (
        <box flexDirection="column" gap={1}>
          <text attributes={TextAttributes.DIM}>
            Known people: {formatKnownPeople(props.personDirectory, props.householdDraft)}
          </text>
          <BooleanSelectRow
            focused={props.focusIndex === 1}
            label="Include spouse in household"
            onChange={(value) =>
              updateFamily((current) => ({
                ...current,
                includeSpouse: value,
                spouse: value ? current.spouse : emptySpouseEditorDraft(),
              }))
            }
            value={family.includeSpouse}
          />
          {!family.includeSpouse ? (
            <box border padding={1}>
              <text>Enable the spouse section to capture MFJ or MFS details.</text>
            </box>
          ) : (
            <box flexDirection="column" gap={1}>
              <SlimFieldRow
                focused={props.focusIndex === 2}
                label="Spouse person ID"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      personId: value,
                    },
                  }))
                }
                value={family.spouse.personId}
              />
              <SlimFieldRow
                focused={props.focusIndex === 3}
                label="First name"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      firstName: value,
                    },
                  }))
                }
                value={family.spouse.firstName}
              />
              <SlimFieldRow
                focused={props.focusIndex === 4}
                label="Last name"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      lastName: value,
                    },
                  }))
                }
                value={family.spouse.lastName}
              />
              <SlimFieldRow
                focused={props.focusIndex === 5}
                label="Full legal name"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      fullLegalName: value,
                    },
                  }))
                }
                value={family.spouse.fullLegalName}
              />
              <SlimFieldRow
                focused={props.focusIndex === 6}
                label="Date of birth"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      dateOfBirth: value,
                    },
                  }))
                }
                value={family.spouse.dateOfBirth}
              />
              <SlimFieldRow
                focused={props.focusIndex === 7}
                label="Tax ID token"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      taxIdToken: value,
                    },
                  }))
                }
                value={family.spouse.taxIdToken}
              />
              <SlimFieldRow
                focused={props.focusIndex === 8}
                label="Last 4 tax ID"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      last4TaxId: value,
                    },
                  }))
                }
                value={family.spouse.last4TaxId}
              />
              <SlimFieldRow
                focused={props.focusIndex === 9}
                label="Citizenship status"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      citizenshipStatus: value,
                    },
                  }))
                }
                value={family.spouse.citizenshipStatus}
              />
              <BooleanSelectRow
                focused={props.focusIndex === 10}
                label="Spouse is blind"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      isBlind: value,
                    },
                  }))
                }
                value={family.spouse.isBlind}
              />
              <BooleanSelectRow
                focused={props.focusIndex === 11}
                label="Spouse is full-time student"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      isFullTimeStudent: value,
                    },
                  }))
                }
                value={family.spouse.isFullTimeStudent}
              />
              <SlimFieldRow
                focused={props.focusIndex === 12}
                label="Occupation"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    spouse: {
                      ...current.spouse,
                      occupation: value,
                    },
                  }))
                }
                value={family.spouse.occupation}
              />
            </box>
          )}
        </box>
      ) : null}

      {props.familyPanel === "dependents" ? (
        <box flexDirection="column" gap={1}>
          <text>`a` adds a dependent. `backspace` removes the selected one.</text>
          <RosterSelect
            emptyMessage="No dependents yet. Focus here and press `a`."
            focused={props.focusIndex === 1}
            items={family.dependents}
            label="Dependents"
            optionDescription={(entry) =>
              `${entry.relationshipToTaxpayer || "relationship pending"} / CTC ${entry.qualifyingForChildTaxCredit ? "yes" : "no"}`
            }
            optionName={(entry, index) =>
              `${index + 1}. ${entry.fullLegalName.trim().length > 0 ? entry.fullLegalName : entry.personId || "Untitled dependent"}`
            }
            selectedIndex={props.selectedDependentIndex}
            setSelectedIndex={props.setSelectedDependentIndex}
          />
          {activeDependent == null ? (
            <box border padding={1}>
              <text>Add a dependent to edit relationship and eligibility flags.</text>
            </box>
          ) : (
            <box flexDirection="column" gap={1}>
              <SlimFieldRow
                focused={props.focusIndex === 2}
                label="Dependent person ID"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            personId: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.personId}
              />
              <SlimFieldRow
                focused={props.focusIndex === 3}
                label="First name"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            firstName: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.firstName}
              />
              <SlimFieldRow
                focused={props.focusIndex === 4}
                label="Last name"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            lastName: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.lastName}
              />
              <SlimFieldRow
                focused={props.focusIndex === 5}
                label="Full legal name"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            fullLegalName: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.fullLegalName}
              />
              <SlimFieldRow
                focused={props.focusIndex === 6}
                label="Date of birth"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            dateOfBirth: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.dateOfBirth}
              />
              <SlimFieldRow
                focused={props.focusIndex === 7}
                label="Tax ID token"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            taxIdToken: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.taxIdToken}
              />
              <SlimFieldRow
                focused={props.focusIndex === 8}
                label="Last 4 tax ID"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            last4TaxId: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.last4TaxId}
              />
              <SlimFieldRow
                focused={props.focusIndex === 9}
                label="Relationship to taxpayer"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            relationshipToTaxpayer: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.relationshipToTaxpayer}
              />
              <SlimFieldRow
                focused={props.focusIndex === 10}
                label="Months lived with taxpayer"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            monthsLivedWithTaxpayer: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.monthsLivedWithTaxpayer}
              />
              <SlimFieldRow
                focused={props.focusIndex === 11}
                label="Support % provided by taxpayer"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            supportPercentageProvidedByTaxpayer: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.supportPercentageProvidedByTaxpayer}
              />
              <BooleanSelectRow
                focused={props.focusIndex === 12}
                label="Candidate for child tax credit"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            qualifyingForChildTaxCredit: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.qualifyingForChildTaxCredit}
              />
              <BooleanSelectRow
                focused={props.focusIndex === 13}
                label="Candidate for credit for other dependents"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            qualifyingForCreditForOtherDependents: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.qualifyingForCreditForOtherDependents}
              />
              <BooleanSelectRow
                focused={props.focusIndex === 14}
                label="Candidate for EITC"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            qualifyingForEitc: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.qualifyingForEitc}
              />
              <BooleanSelectRow
                focused={props.focusIndex === 15}
                label="Dependent is disabled"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            isDisabled: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.isDisabled}
              />
              <BooleanSelectRow
                focused={props.focusIndex === 16}
                label="Dependent is full-time student"
                onChange={(value) =>
                  updateFamily((current) => ({
                    ...current,
                    dependents: current.dependents.map((entry, index) =>
                      index === props.selectedDependentIndex
                        ? {
                            ...entry,
                            isFullTimeStudent: value,
                          }
                        : entry,
                    ),
                  }))
                }
                value={activeDependent.isFullTimeStudent}
              />
            </box>
          )}
        </box>
      ) : null}
    </box>
  );
}

function AdditionalDocumentsStep(props: {
  readonly documentsPanel:
    | "1099_b"
    | "1099_g"
    | "ssa_1099"
    | "1098"
    | "1098_e"
    | "1098_t"
    | "1095_a";
  readonly focusIndex: number;
  readonly personDirectory: ReadonlyArray<ReturnType<typeof buildPersonDirectory>[number]>;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly selected1095AIndex: number;
  readonly selected1095AMonthlyRowIndex: number;
  readonly selected1098EIndex: number;
  readonly selected1098Index: number;
  readonly selected1098TIndex: number;
  readonly selected1099BIndex: number;
  readonly selected1099BTransactionIndex: number;
  readonly selected1099GIndex: number;
  readonly selectedSsa1099Index: number;
  readonly setDocumentsPanel: (
    value:
      | "1099_b"
      | "1099_g"
      | "ssa_1099"
      | "1098"
      | "1098_e"
      | "1098_t"
      | "1095_a",
  ) => void;
  readonly setSelected1095AIndex: (value: number) => void;
  readonly setSelected1095AMonthlyRowIndex: (value: number) => void;
  readonly setSelected1098EIndex: (value: number) => void;
  readonly setSelected1098Index: (value: number) => void;
  readonly setSelected1098TIndex: (value: number) => void;
  readonly setSelected1099BIndex: (value: number) => void;
  readonly setSelected1099BTransactionIndex: (value: number) => void;
  readonly setSelected1099GIndex: (value: number) => void;
  readonly setSelectedSsa1099Index: (value: number) => void;
  readonly setSupplementalFederalDraft: StateSetter<InteractiveSupplementalFederalDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.supplementalFederalDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit additional federal source documents.</text>
      </box>
    );
  }

  const documents = props.supplementalFederalDraft.documents;

  const updateDocuments = (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => {
    props.setSupplementalFederalDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            documents: updater(current.documents),
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>
        These forms now write both the source document row and the normalized federal fact rows
        needed by the calculator.
      </text>
      <SelectFieldRow
        focused={props.focusIndex === 0}
        label="Document type"
        onChange={props.setDocumentsPanel}
        options={documentPanelOptions}
        value={props.documentsPanel}
      />

      {props.documentsPanel === "1099_b" ? (
        <Document1099BPanel
          documents={documents}
          focusIndex={props.focusIndex}
          selected1099BIndex={props.selected1099BIndex}
          selected1099BTransactionIndex={props.selected1099BTransactionIndex}
          setSelected1099BIndex={props.setSelected1099BIndex}
          setSelected1099BTransactionIndex={props.setSelected1099BTransactionIndex}
          updateDocuments={updateDocuments}
        />
      ) : null}

      {props.documentsPanel === "1099_g" ? (
        <Document1099GPanel
          documents={documents}
          focusIndex={props.focusIndex}
          selected1099GIndex={props.selected1099GIndex}
          setSelected1099GIndex={props.setSelected1099GIndex}
          updateDocuments={updateDocuments}
        />
      ) : null}

      {props.documentsPanel === "ssa_1099" ? (
        <DocumentSsa1099Panel
          documents={documents}
          focusIndex={props.focusIndex}
          selectedSsa1099Index={props.selectedSsa1099Index}
          setSelectedSsa1099Index={props.setSelectedSsa1099Index}
          updateDocuments={updateDocuments}
        />
      ) : null}

      {props.documentsPanel === "1098" ? (
        <Document1098Panel
          documents={documents}
          focusIndex={props.focusIndex}
          selected1098Index={props.selected1098Index}
          setSelected1098Index={props.setSelected1098Index}
          updateDocuments={updateDocuments}
        />
      ) : null}

      {props.documentsPanel === "1098_e" ? (
        <Document1098EPanel
          documents={documents}
          focusIndex={props.focusIndex}
          selected1098EIndex={props.selected1098EIndex}
          setSelected1098EIndex={props.setSelected1098EIndex}
          updateDocuments={updateDocuments}
        />
      ) : null}

      {props.documentsPanel === "1098_t" ? (
        <Document1098TPanel
          documents={documents}
          focusIndex={props.focusIndex}
          knownPeople={formatKnownPeople(props.personDirectory, null)}
          selected1098TIndex={props.selected1098TIndex}
          setSelected1098TIndex={props.setSelected1098TIndex}
          updateDocuments={updateDocuments}
        />
      ) : null}

      {props.documentsPanel === "1095_a" ? (
        <Document1095APanel
          documents={documents}
          focusIndex={props.focusIndex}
          knownPeople={formatKnownPeople(props.personDirectory, null)}
          selected1095AIndex={props.selected1095AIndex}
          selected1095AMonthlyRowIndex={props.selected1095AMonthlyRowIndex}
          setSelected1095AIndex={props.setSelected1095AIndex}
          setSelected1095AMonthlyRowIndex={props.setSelected1095AMonthlyRowIndex}
          updateDocuments={updateDocuments}
        />
      ) : null}
    </box>
  );
}

function SupplementalIncomeStep(props: {
  readonly supplementalIncomePanel:
    | "1099_nec"
    | "1099_misc"
    | "schedule_c"
    | "schedule_e"
    | "other_income"
    | "withholdings";
  readonly focusIndex: number;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly selected1099MiscIndex: number;
  readonly selected1099NecIndex: number;
  readonly selectedOtherIncomeIndex: number;
  readonly selectedScheduleCIndex: number;
  readonly selectedScheduleEIndex: number;
  readonly selectedSupplementalWithholdingIndex: number;
  readonly setSelected1099MiscIndex: (value: number) => void;
  readonly setSelected1099NecIndex: (value: number) => void;
  readonly setSelectedOtherIncomeIndex: (value: number) => void;
  readonly setSelectedScheduleCIndex: (value: number) => void;
  readonly setSelectedScheduleEIndex: (value: number) => void;
  readonly setSelectedSupplementalWithholdingIndex: (value: number) => void;
  readonly setSupplementalIncomePanel: (
    value:
      | "1099_nec"
      | "1099_misc"
      | "schedule_c"
      | "schedule_e"
      | "other_income"
      | "withholdings",
  ) => void;
  readonly setSupplementalFederalDraft: StateSetter<InteractiveSupplementalFederalDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.supplementalFederalDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit supplemental income facts.</text>
      </box>
    );
  }

  const supplementalIncome = props.supplementalFederalDraft.supplementalIncome;

  const updateSupplementalIncome = (
    updater: (
      draft: InteractiveSupplementalFederalDraft["supplementalIncome"],
    ) => InteractiveSupplementalFederalDraft["supplementalIncome"],
  ) => {
    props.setSupplementalFederalDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            supplementalIncome: updater(current.supplementalIncome),
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>Use the panel switch to edit the remaining income-producing federal forms.</text>
      <SelectFieldRow
        focused={props.focusIndex === 0}
        label="Supplemental income section"
        onChange={props.setSupplementalIncomePanel}
        options={supplementalIncomePanelOptions}
        value={props.supplementalIncomePanel}
      />

      {props.supplementalIncomePanel === "1099_nec" ? (
        <Income1099NecPanel
          focusIndex={props.focusIndex}
          selectedIndex={props.selected1099NecIndex}
          setSelectedIndex={props.setSelected1099NecIndex}
          supplementalIncome={supplementalIncome}
          updateSupplementalIncome={updateSupplementalIncome}
        />
      ) : null}

      {props.supplementalIncomePanel === "1099_misc" ? (
        <Income1099MiscPanel
          focusIndex={props.focusIndex}
          selectedIndex={props.selected1099MiscIndex}
          setSelectedIndex={props.setSelected1099MiscIndex}
          supplementalIncome={supplementalIncome}
          updateSupplementalIncome={updateSupplementalIncome}
        />
      ) : null}

      {props.supplementalIncomePanel === "schedule_c" ? (
        <IncomeScheduleCPanel
          focusIndex={props.focusIndex}
          selectedIndex={props.selectedScheduleCIndex}
          setSelectedIndex={props.setSelectedScheduleCIndex}
          supplementalIncome={supplementalIncome}
          updateSupplementalIncome={updateSupplementalIncome}
        />
      ) : null}

      {props.supplementalIncomePanel === "schedule_e" ? (
        <IncomeScheduleEPanel
          focusIndex={props.focusIndex}
          selectedIndex={props.selectedScheduleEIndex}
          setSelectedIndex={props.setSelectedScheduleEIndex}
          supplementalIncome={supplementalIncome}
          updateSupplementalIncome={updateSupplementalIncome}
        />
      ) : null}

      {props.supplementalIncomePanel === "other_income" ? (
        <IncomeOtherPanel
          focusIndex={props.focusIndex}
          selectedIndex={props.selectedOtherIncomeIndex}
          setSelectedIndex={props.setSelectedOtherIncomeIndex}
          supplementalIncome={supplementalIncome}
          updateSupplementalIncome={updateSupplementalIncome}
        />
      ) : null}

      {props.supplementalIncomePanel === "withholdings" ? (
        <SupplementalWithholdingsPanel
          focusIndex={props.focusIndex}
          selectedIndex={props.selectedSupplementalWithholdingIndex}
          setSelectedIndex={props.setSelectedSupplementalWithholdingIndex}
          supplementalIncome={supplementalIncome}
          updateSupplementalIncome={updateSupplementalIncome}
        />
      ) : null}
    </box>
  );
}

function DeductionsStep(props: {
  readonly deductionsPanel: "adjustments" | "itemized";
  readonly focusIndex: number;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly selectedOtherAdjustmentIndex: number;
  readonly selectedOtherItemizedDeductionIndex: number;
  readonly setDeductionsPanel: (value: "adjustments" | "itemized") => void;
  readonly setSelectedOtherAdjustmentIndex: (value: number) => void;
  readonly setSelectedOtherItemizedDeductionIndex: (value: number) => void;
  readonly setSupplementalFederalDraft: StateSetter<InteractiveSupplementalFederalDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.supplementalFederalDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit deduction sections.</text>
      </box>
    );
  }

  const deductions = props.supplementalFederalDraft.deductions;

  const updateDeductions = (
    updater: (
      draft: InteractiveSupplementalFederalDraft["deductions"],
    ) => InteractiveSupplementalFederalDraft["deductions"],
  ) => {
    props.setSupplementalFederalDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            deductions: updater(current.deductions),
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>
        Form-linked 1098 and 1098-E data lives in Other Docs. This step handles the remaining
        federal adjustments and itemized-deduction rows.
      </text>
      <SelectFieldRow
        focused={props.focusIndex === 0}
        label="Deduction section"
        onChange={props.setDeductionsPanel}
        options={deductionsPanelOptions}
        value={props.deductionsPanel}
      />

      {props.deductionsPanel === "adjustments" ? (
        <AdjustmentsPanel
          deductions={deductions}
          focusIndex={props.focusIndex}
          selectedOtherAdjustmentIndex={props.selectedOtherAdjustmentIndex}
          setSelectedOtherAdjustmentIndex={props.setSelectedOtherAdjustmentIndex}
          updateDeductions={updateDeductions}
        />
      ) : null}

      {props.deductionsPanel === "itemized" ? (
        <ItemizedPanel
          deductions={deductions}
          focusIndex={props.focusIndex}
          selectedOtherItemizedDeductionIndex={props.selectedOtherItemizedDeductionIndex}
          setSelectedOtherItemizedDeductionIndex={props.setSelectedOtherItemizedDeductionIndex}
          updateDeductions={updateDeductions}
        />
      ) : null}
    </box>
  );
}

function CreditsStep(props: {
  readonly creditsPanel:
    | "candidates"
    | "care_providers"
    | "care_expenses"
    | "energy"
    | "vehicles"
    | "other_credits"
    | "hsa";
  readonly focusIndex: number;
  readonly personDirectory: ReadonlyArray<ReturnType<typeof buildPersonDirectory>[number]>;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly selectedCareExpenseIndex: number;
  readonly selectedCareProviderIndex: number;
  readonly selectedEnergyProjectIndex: number;
  readonly selectedHsaCoverageIndex: number;
  readonly selectedOtherNonrefundableCreditIndex: number;
  readonly selectedOtherRefundableCreditIndex: number;
  readonly selectedVehicleCreditIndex: number;
  readonly setCreditsPanel: (
    value:
      | "candidates"
      | "care_providers"
      | "care_expenses"
      | "energy"
      | "vehicles"
      | "other_credits"
      | "hsa",
  ) => void;
  readonly setSelectedCareExpenseIndex: (value: number) => void;
  readonly setSelectedCareProviderIndex: (value: number) => void;
  readonly setSelectedEnergyProjectIndex: (value: number) => void;
  readonly setSelectedHsaCoverageIndex: (value: number) => void;
  readonly setSelectedOtherNonrefundableCreditIndex: (value: number) => void;
  readonly setSelectedOtherRefundableCreditIndex: (value: number) => void;
  readonly setSelectedVehicleCreditIndex: (value: number) => void;
  readonly setSupplementalFederalDraft: StateSetter<InteractiveSupplementalFederalDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.supplementalFederalDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit credit and coverage sections.</text>
      </box>
    );
  }

  const credits = props.supplementalFederalDraft.credits;

  const updateCredits = (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => {
    props.setSupplementalFederalDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            credits: updater(current.credits),
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>
        Education and marketplace credits are driven from 1098-T and 1095-A in Other Docs. This
        section handles the remaining credit selections, care, energy, vehicle, and HSA inputs.
      </text>
      <SelectFieldRow
        focused={props.focusIndex === 0}
        label="Credit section"
        onChange={props.setCreditsPanel}
        options={creditsPanelOptions}
        value={props.creditsPanel}
      />

      {props.creditsPanel === "candidates" ? (
        <CreditCandidatesPanel credits={credits} focusIndex={props.focusIndex} updateCredits={updateCredits} />
      ) : null}

      {props.creditsPanel === "care_providers" ? (
        <CreditCareProvidersPanel
          credits={credits}
          focusIndex={props.focusIndex}
          knownPeople={formatKnownPeople(props.personDirectory, null)}
          selectedCareProviderIndex={props.selectedCareProviderIndex}
          setSelectedCareProviderIndex={props.setSelectedCareProviderIndex}
          updateCredits={updateCredits}
        />
      ) : null}

      {props.creditsPanel === "care_expenses" ? (
        <CreditCareExpensesPanel
          credits={credits}
          focusIndex={props.focusIndex}
          selectedCareExpenseIndex={props.selectedCareExpenseIndex}
          setSelectedCareExpenseIndex={props.setSelectedCareExpenseIndex}
          updateCredits={updateCredits}
        />
      ) : null}

      {props.creditsPanel === "energy" ? (
        <CreditEnergyPanel
          credits={credits}
          focusIndex={props.focusIndex}
          selectedEnergyProjectIndex={props.selectedEnergyProjectIndex}
          setSelectedEnergyProjectIndex={props.setSelectedEnergyProjectIndex}
          updateCredits={updateCredits}
        />
      ) : null}

      {props.creditsPanel === "vehicles" ? (
        <CreditVehiclesPanel
          credits={credits}
          focusIndex={props.focusIndex}
          selectedVehicleCreditIndex={props.selectedVehicleCreditIndex}
          setSelectedVehicleCreditIndex={props.setSelectedVehicleCreditIndex}
          updateCredits={updateCredits}
        />
      ) : null}

      {props.creditsPanel === "other_credits" ? (
        <CreditOtherCreditsPanel
          credits={credits}
          focusIndex={props.focusIndex}
          selectedOtherNonrefundableCreditIndex={props.selectedOtherNonrefundableCreditIndex}
          selectedOtherRefundableCreditIndex={props.selectedOtherRefundableCreditIndex}
          setSelectedOtherNonrefundableCreditIndex={props.setSelectedOtherNonrefundableCreditIndex}
          setSelectedOtherRefundableCreditIndex={props.setSelectedOtherRefundableCreditIndex}
          updateCredits={updateCredits}
        />
      ) : null}

      {props.creditsPanel === "hsa" ? (
        <CreditHsaPanel
          credits={credits}
          focusIndex={props.focusIndex}
          selectedHsaCoverageIndex={props.selectedHsaCoverageIndex}
          setSelectedHsaCoverageIndex={props.setSelectedHsaCoverageIndex}
          updateCredits={updateCredits}
        />
      ) : null}
    </box>
  );
}

function OverridesStep(props: {
  readonly focusIndex: number;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly selectedFederalOverrideIndex: number;
  readonly selectedOtherElectionIndex: number;
  readonly setSelectedFederalOverrideIndex: (value: number) => void;
  readonly setSelectedOtherElectionIndex: (value: number) => void;
  readonly setSupplementalFederalDraft: StateSetter<InteractiveSupplementalFederalDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.supplementalFederalDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit federal override and election sections.</text>
      </box>
    );
  }

  const overrides = props.supplementalFederalDraft.overrides;

  const updateOverrides = (
    updater: (
      draft: InteractiveSupplementalFederalDraft["overrides"],
    ) => InteractiveSupplementalFederalDraft["overrides"],
  ) => {
    props.setSupplementalFederalDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            overrides: updater(current.overrides),
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>
        Federal overrides stay key/value based because the bag is intentionally open-ended, but
        you no longer need to hand-edit the whole object as raw JSON.
      </text>
      <RosterSelect
        emptyMessage="No override entries yet. Focus here and press `a`."
        focused={props.focusIndex === 0}
        items={overrides.federalOverrides}
        label="Federal override entries"
        optionDescription={(entry) => truncateMiddle(entry.valueText, 48)}
        optionName={(entry, index) =>
          `${index + 1}. ${entry.key.trim().length > 0 ? entry.key : "Untitled override"}`
        }
        selectedIndex={props.selectedFederalOverrideIndex}
        setSelectedIndex={props.setSelectedFederalOverrideIndex}
      />
      {(overrides.federalOverrides[props.selectedFederalOverrideIndex] ?? null) == null ? (
        <box border padding={1}>
          <text>Add an override row to edit a federal override key and value.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 1}
            label="Override key"
            onChange={(value) =>
              updateOverrides((current) => ({
                ...current,
                federalOverrides: current.federalOverrides.map((entry, index) =>
                  index === props.selectedFederalOverrideIndex
                    ? {
                        ...entry,
                        key: value,
                      }
                    : entry,
                ),
              }))
            }
            value={overrides.federalOverrides[props.selectedFederalOverrideIndex]?.key ?? ""}
          />
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Override value"
            onChange={(value) =>
              updateOverrides((current) => ({
                ...current,
                federalOverrides: current.federalOverrides.map((entry, index) =>
                  index === props.selectedFederalOverrideIndex
                    ? {
                        ...entry,
                        valueText: value,
                      }
                    : entry,
                ),
              }))
            }
            value={overrides.federalOverrides[props.selectedFederalOverrideIndex]?.valueText ?? ""}
          />
        </box>
      )}

      <SelectFieldRow
        focused={props.focusIndex === 3}
        label="Deduction strategy preference"
        onChange={(value) =>
          updateOverrides((current) => ({
            ...current,
            deductionStrategyPreference: value,
          }))
        }
        options={deductionStrategyPreferenceOptions}
        value={
          overrides.deductionStrategyPreference === "itemized" ||
          overrides.deductionStrategyPreference === "standard"
            ? overrides.deductionStrategyPreference
            : "auto"
        }
      />
      <BooleanSelectRow
        focused={props.focusIndex === 4}
        label="Capital loss carryforward imported"
        onChange={(value) =>
          updateOverrides((current) => ({
            ...current,
            capitalLossCarryforwardImported: value,
          }))
        }
        value={overrides.capitalLossCarryforwardImported}
      />
      <BooleanSelectRow
        focused={props.focusIndex === 5}
        label="Self-select PIN authorized"
        onChange={(value) =>
          updateOverrides((current) => ({
            ...current,
            selfSelectPinAuthorized: value,
          }))
        }
        value={overrides.selfSelectPinAuthorized}
      />
      <SlimFieldRow
        focused={props.focusIndex === 6}
        label="State filing opt-in states"
        onChange={(value) =>
          updateOverrides((current) => ({
            ...current,
            stateFilingOptInStates: value,
          }))
        }
        value={overrides.stateFilingOptInStates}
      />
      <RosterSelect
        emptyMessage="No additional elections yet. Focus here and press `a`."
        focused={props.focusIndex === 7}
        items={overrides.otherElections}
        label="Other elections"
        optionDescription={(entry) => entry.selectionBasis}
        optionName={(entry, index) =>
          `${index + 1}. ${entry.electionCode.trim().length > 0 ? entry.electionCode : "Untitled election"}`
        }
        selectedIndex={props.selectedOtherElectionIndex}
        setSelectedIndex={props.setSelectedOtherElectionIndex}
      />
      {(overrides.otherElections[props.selectedOtherElectionIndex] ?? null) == null ? (
        <box border padding={1}>
          <text>Add an election row to set its code, basis, and selected value.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 8}
            label="Election code"
            onChange={(value) =>
              updateOverrides((current) => ({
                ...current,
                otherElections: current.otherElections.map((entry, index) =>
                  index === props.selectedOtherElectionIndex
                    ? {
                        ...entry,
                        electionCode: value,
                      }
                    : entry,
                ),
              }))
            }
            value={overrides.otherElections[props.selectedOtherElectionIndex]?.electionCode ?? ""}
          />
          <SlimFieldRow
            focused={props.focusIndex === 9}
            label="Description"
            onChange={(value) =>
              updateOverrides((current) => ({
                ...current,
                otherElections: current.otherElections.map((entry, index) =>
                  index === props.selectedOtherElectionIndex
                    ? {
                        ...entry,
                        description: value,
                      }
                    : entry,
                ),
              }))
            }
            value={overrides.otherElections[props.selectedOtherElectionIndex]?.description ?? ""}
          />
          <SlimFieldRow
            focused={props.focusIndex === 10}
            label="Selected value"
            onChange={(value) =>
              updateOverrides((current) => ({
                ...current,
                otherElections: current.otherElections.map((entry, index) =>
                  index === props.selectedOtherElectionIndex
                    ? {
                        ...entry,
                        selectedValueText: value,
                      }
                    : entry,
                ),
              }))
            }
            value={
              overrides.otherElections[props.selectedOtherElectionIndex]?.selectedValueText ?? ""
            }
          />
          <SelectFieldRow
            focused={props.focusIndex === 11}
            label="Selection basis"
            onChange={(value) =>
              updateOverrides((current) => ({
                ...current,
                otherElections: current.otherElections.map((entry, index) =>
                  index === props.selectedOtherElectionIndex
                    ? {
                        ...entry,
                        selectionBasis: value,
                      }
                    : entry,
                ),
              }))
            }
            options={electionSelectionBasisOptions}
            value={
              (electionSelectionBasisValues as ReadonlyArray<string>).includes(
                overrides.otherElections[props.selectedOtherElectionIndex]?.selectionBasis ?? "",
              )
                ? (overrides.otherElections[props.selectedOtherElectionIndex]
                    ?.selectionBasis as (typeof electionSelectionBasisValues)[number])
                : "user_selected"
            }
          />
          <SlimFieldRow
            focused={props.focusIndex === 12}
            label="Notes"
            onChange={(value) =>
              updateOverrides((current) => ({
                ...current,
                otherElections: current.otherElections.map((entry, index) =>
                  index === props.selectedOtherElectionIndex
                    ? {
                        ...entry,
                        notes: value,
                      }
                    : entry,
                ),
              }))
            }
            value={overrides.otherElections[props.selectedOtherElectionIndex]?.notes ?? ""}
          />
        </box>
      )}
    </box>
  );
}

function RosterSelect<T>(props: {
  readonly emptyMessage: string;
  readonly focused: boolean;
  readonly items: ReadonlyArray<T>;
  readonly label: string;
  readonly optionDescription: (item: T, index: number) => string;
  readonly optionName: (item: T, index: number) => string;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (value: number) => void;
}) {
  return (
    <box border padding={1} flexDirection="column" gap={1}>
      <text>{props.label}</text>
      {props.items.length === 0 ? (
        <text>{props.emptyMessage}</text>
      ) : (
        <select
          options={props.items.map((item, index) => ({
            name: props.optionName(item, index),
            description: props.optionDescription(item, index),
            value: `${index}`,
          }))}
          height={Math.min(Math.max(props.items.length, 2), 3)}
          selectedIndex={Math.min(props.selectedIndex, props.items.length - 1)}
          onChange={(index) => {
            props.setSelectedIndex(index);
          }}
          focused={props.focused}
        />
      )}
    </box>
  );
}

function updateArrayEntry<T>(
  items: ReadonlyArray<T>,
  index: number,
  updater: (item: T) => T,
): ReadonlyArray<T> {
  return items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));
}

function formatKnownPeople(
  people: ReadonlyArray<ReturnType<typeof buildPersonDirectory>[number]>,
  householdDraft: HouseholdDraft | null,
): string {
  if (people.length === 0) {
    if (householdDraft == null) {
      return "p_taxpayer";
    }

    return `p_taxpayer (${householdDraft.fullLegalName || `${householdDraft.firstName} ${householdDraft.lastName}`.trim() || "taxpayer"})`;
  }

  return people
    .map((person) => `${person.personId}${person.fullLegalName.trim().length > 0 ? ` (${person.fullLegalName})` : ""}`)
    .join(", ");
}

function Document1099BPanel(props: {
  readonly documents: InteractiveSupplementalFederalDraft["documents"];
  readonly focusIndex: number;
  readonly selected1099BIndex: number;
  readonly selected1099BTransactionIndex: number;
  readonly setSelected1099BIndex: (value: number) => void;
  readonly setSelected1099BTransactionIndex: (value: number) => void;
  readonly updateDocuments: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => void;
}) {
  const forms = props.documents.brokerageForms;
  const activeForm = forms[props.selected1099BIndex] ?? null;
  const activeTransaction =
    activeForm?.transactions[props.selected1099BTransactionIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <text>`a` adds a 1099-B or transaction when its roster is focused.</text>
      <RosterSelect
        emptyMessage="No 1099-B entries yet. Focus here and press `a`."
        focused={props.focusIndex === 1}
        items={forms}
        label="1099-B entries"
        optionDescription={(entry) => `${entry.transactions.length} transaction(s)`}
        optionName={(entry, index) =>
          `${index + 1}. ${entry.payerName.trim().length > 0 ? entry.payerName : "Untitled 1099-B"}`
        }
        selectedIndex={props.selected1099BIndex}
        setSelectedIndex={props.setSelected1099BIndex}
      />
      {activeForm == null ? (
        <box border padding={1}>
          <text>Add a 1099-B to edit payer and transaction fields.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Payer name"
            onChange={(value) =>
              props.updateDocuments((current) => ({
                ...current,
                brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({
                  ...entry,
                  payerName: value,
                })),
              }))
            }
            value={activeForm.payerName}
          />
          <SlimFieldRow
            focused={props.focusIndex === 3}
            label="Payer TIN"
            onChange={(value) =>
              props.updateDocuments((current) => ({
                ...current,
                brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({
                  ...entry,
                  payerTin: value,
                })),
              }))
            }
            value={activeForm.payerTin}
          />
          <SlimFieldRow
            focused={props.focusIndex === 4}
            label="Recipient account number"
            onChange={(value) =>
              props.updateDocuments((current) => ({
                ...current,
                brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({
                  ...entry,
                  recipientAccountNumber: value,
                })),
              }))
            }
            value={activeForm.recipientAccountNumber}
          />
          <SlimFieldRow
            focused={props.focusIndex === 5}
            label="Federal withholding"
            onChange={(value) =>
              props.updateDocuments((current) => ({
                ...current,
                brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({
                  ...entry,
                  federalIncomeTaxWithheld: value,
                })),
              }))
            }
            value={activeForm.federalIncomeTaxWithheld}
          />
          <RosterSelect
            emptyMessage="No transaction rows yet. Focus here and press `a`."
            focused={props.focusIndex === 6}
            items={activeForm.transactions}
            label="Broker transactions"
            optionDescription={(entry) => `${entry.proceeds || "0"} proceeds / ${entry.term || "term pending"}`}
            optionName={(entry, index) =>
              `${index + 1}. ${entry.assetDescription.trim().length > 0 ? entry.assetDescription : "Untitled transaction"}`
            }
            selectedIndex={props.selected1099BTransactionIndex}
            setSelectedIndex={props.setSelected1099BTransactionIndex}
          />
          {activeTransaction == null ? (
            <box border padding={1}>
              <text>Add a transaction to edit Form 8949 details.</text>
            </box>
          ) : (
            <box flexDirection="column" gap={1}>
              <SlimFieldRow
                focused={props.focusIndex === 7}
                label="Asset description"
                onChange={(value) =>
                  props.updateDocuments((current) => ({
                    ...current,
                    brokerageForms: updateArrayEntry(
                      current.brokerageForms,
                      props.selected1099BIndex,
                      (entry) => ({
                        ...entry,
                        transactions: updateArrayEntry(
                          entry.transactions,
                          props.selected1099BTransactionIndex,
                          (transaction) => ({
                            ...transaction,
                            assetDescription: value,
                          }),
                        ),
                      }),
                    ),
                  }))
                }
                value={activeTransaction.assetDescription}
              />
              <SlimFieldRow focused={props.focusIndex === 8} label="Date acquired" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, dateAcquired: value })) })) }))} value={activeTransaction.dateAcquired} />
              <SlimFieldRow focused={props.focusIndex === 9} label="Date sold" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, dateSold: value })) })) }))} value={activeTransaction.dateSold} />
              <SlimFieldRow focused={props.focusIndex === 10} label="Proceeds" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, proceeds: value })) })) }))} value={activeTransaction.proceeds} />
              <SlimFieldRow focused={props.focusIndex === 11} label="Cost basis" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, costBasis: value })) })) }))} value={activeTransaction.costBasis} />
              <SlimFieldRow focused={props.focusIndex === 12} label="Accrued market discount" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, accruedMarketDiscount: value })) })) }))} value={activeTransaction.accruedMarketDiscount} />
              <SlimFieldRow focused={props.focusIndex === 13} label="Wash sale loss disallowed" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, washSaleLossDisallowed: value })) })) }))} value={activeTransaction.washSaleLossDisallowed} />
              <SlimFieldRow focused={props.focusIndex === 14} label="Gain or loss" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, gainOrLoss: value })) })) }))} value={activeTransaction.gainOrLoss} />
              <SelectFieldRow focused={props.focusIndex === 15} label="Basis reported to IRS" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, basisReportedToIrs: value })) })) }))} options={basisReportedOptions} value={activeTransaction.basisReportedToIrs} />
              <SelectFieldRow focused={props.focusIndex === 16} label="Term" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, term: value })) })) }))} options={capitalTransactionTermOptions} value={capitalTransactionTermValues.includes(activeTransaction.term as (typeof capitalTransactionTermValues)[number]) ? (activeTransaction.term as (typeof capitalTransactionTermValues)[number]) : "long"} />
              <SelectFieldRow focused={props.focusIndex === 17} label="Form 8949 box" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, form8949Box: value })) })) }))} options={form8949BoxOptions} value={form8949BoxValues.includes(activeTransaction.form8949Box as (typeof form8949BoxValues)[number]) ? (activeTransaction.form8949Box as (typeof form8949BoxValues)[number]) : "A"} />
              <SlimFieldRow focused={props.focusIndex === 18} label="Country or issuer" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, countryOrIssuer: value })) })) }))} value={activeTransaction.countryOrIssuer} />
              <SlimFieldRow focused={props.focusIndex === 19} label="Notes" onChange={(value) => props.updateDocuments((current) => ({ ...current, brokerageForms: updateArrayEntry(current.brokerageForms, props.selected1099BIndex, (entry) => ({ ...entry, transactions: updateArrayEntry(entry.transactions, props.selected1099BTransactionIndex, (transaction) => ({ ...transaction, notes: value })) })) }))} value={activeTransaction.notes} />
            </box>
          )}
        </box>
      )}
    </box>
  );
}

function Document1099GPanel(props: {
  readonly documents: InteractiveSupplementalFederalDraft["documents"];
  readonly focusIndex: number;
  readonly selected1099GIndex: number;
  readonly setSelected1099GIndex: (value: number) => void;
  readonly updateDocuments: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => void;
}) {
  const forms = props.documents.unemploymentForms;
  const activeForm = forms[props.selected1099GIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No 1099-G entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="1099-G entries" optionDescription={(entry) => `${entry.unemploymentCompensation || "0"} unemployment`} optionName={(entry, index) => `${index + 1}. ${entry.payerName.trim().length > 0 ? entry.payerName : "Untitled 1099-G"}`} selectedIndex={props.selected1099GIndex} setSelectedIndex={props.setSelected1099GIndex} />
      {activeForm == null ? (
        <box border padding={1}>
          <text>Add a 1099-G to capture unemployment compensation.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateDocuments((current) => ({ ...current, unemploymentForms: updateArrayEntry(current.unemploymentForms, props.selected1099GIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeForm.personId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Payer name" onChange={(value) => props.updateDocuments((current) => ({ ...current, unemploymentForms: updateArrayEntry(current.unemploymentForms, props.selected1099GIndex, (entry) => ({ ...entry, payerName: value })) }))} value={activeForm.payerName} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Payer state or ID" onChange={(value) => props.updateDocuments((current) => ({ ...current, unemploymentForms: updateArrayEntry(current.unemploymentForms, props.selected1099GIndex, (entry) => ({ ...entry, payerStateOrId: value })) }))} value={activeForm.payerStateOrId} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Unemployment compensation" onChange={(value) => props.updateDocuments((current) => ({ ...current, unemploymentForms: updateArrayEntry(current.unemploymentForms, props.selected1099GIndex, (entry) => ({ ...entry, unemploymentCompensation: value })) }))} value={activeForm.unemploymentCompensation} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Federal withholding" onChange={(value) => props.updateDocuments((current) => ({ ...current, unemploymentForms: updateArrayEntry(current.unemploymentForms, props.selected1099GIndex, (entry) => ({ ...entry, federalIncomeTaxWithheld: value })) }))} value={activeForm.federalIncomeTaxWithheld} />
          <SlimFieldRow focused={props.focusIndex === 7} label="State code" onChange={(value) => props.updateDocuments((current) => ({ ...current, unemploymentForms: updateArrayEntry(current.unemploymentForms, props.selected1099GIndex, (entry) => ({ ...entry, stateCode: value })) }))} value={activeForm.stateCode} />
        </box>
      )}
    </box>
  );
}

function DocumentSsa1099Panel(props: {
  readonly documents: InteractiveSupplementalFederalDraft["documents"];
  readonly focusIndex: number;
  readonly selectedSsa1099Index: number;
  readonly setSelectedSsa1099Index: (value: number) => void;
  readonly updateDocuments: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => void;
}) {
  const forms = props.documents.socialSecurityForms;
  const activeForm = forms[props.selectedSsa1099Index] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No SSA-1099 entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="SSA-1099 entries" optionDescription={(entry) => `${entry.netBenefits || "0"} net benefits`} optionName={(entry, index) => `${index + 1}. ${entry.documentId || "Untitled SSA-1099"}`} selectedIndex={props.selectedSsa1099Index} setSelectedIndex={props.setSelectedSsa1099Index} />
      {activeForm == null ? <box border padding={1}><text>Add an SSA-1099 to edit benefits and Medicare premium carry-through.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateDocuments((current) => ({ ...current, socialSecurityForms: updateArrayEntry(current.socialSecurityForms, props.selectedSsa1099Index, (entry) => ({ ...entry, personId: value })) }))} value={activeForm.personId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Benefits paid" onChange={(value) => props.updateDocuments((current) => ({ ...current, socialSecurityForms: updateArrayEntry(current.socialSecurityForms, props.selectedSsa1099Index, (entry) => ({ ...entry, benefitsPaid: value })) }))} value={activeForm.benefitsPaid} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Benefits repaid" onChange={(value) => props.updateDocuments((current) => ({ ...current, socialSecurityForms: updateArrayEntry(current.socialSecurityForms, props.selectedSsa1099Index, (entry) => ({ ...entry, benefitsRepaid: value })) }))} value={activeForm.benefitsRepaid} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Net benefits" onChange={(value) => props.updateDocuments((current) => ({ ...current, socialSecurityForms: updateArrayEntry(current.socialSecurityForms, props.selectedSsa1099Index, (entry) => ({ ...entry, netBenefits: value })) }))} value={activeForm.netBenefits} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Medicare Part B premiums" onChange={(value) => props.updateDocuments((current) => ({ ...current, socialSecurityForms: updateArrayEntry(current.socialSecurityForms, props.selectedSsa1099Index, (entry) => ({ ...entry, medicarePartBPremiums: value })) }))} value={activeForm.medicarePartBPremiums} />
          <SlimFieldRow focused={props.focusIndex === 7} label="Medicare Part D premiums" onChange={(value) => props.updateDocuments((current) => ({ ...current, socialSecurityForms: updateArrayEntry(current.socialSecurityForms, props.selectedSsa1099Index, (entry) => ({ ...entry, medicarePartDPremiums: value })) }))} value={activeForm.medicarePartDPremiums} />
        </box>
      )}
    </box>
  );
}

function Document1098Panel(props: {
  readonly documents: InteractiveSupplementalFederalDraft["documents"];
  readonly focusIndex: number;
  readonly selected1098Index: number;
  readonly setSelected1098Index: (value: number) => void;
  readonly updateDocuments: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => void;
}) {
  const forms = props.documents.mortgageInterestForms;
  const activeForm = forms[props.selected1098Index] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No 1098 entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="1098 entries" optionDescription={(entry) => `${entry.mortgageInterestReceived || "0"} mortgage interest`} optionName={(entry, index) => `${index + 1}. ${entry.lenderName.trim().length > 0 ? entry.lenderName : "Untitled 1098"}`} selectedIndex={props.selected1098Index} setSelectedIndex={props.setSelected1098Index} />
      {activeForm == null ? <box border padding={1}><text>Add a 1098 to capture mortgage interest and property details.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Lender name" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, lenderName: value })) }))} value={activeForm.lenderName} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Lender TIN" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, lenderTin: value })) }))} value={activeForm.lenderTin} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Mortgage interest received" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, mortgageInterestReceived: value })) }))} value={activeForm.mortgageInterestReceived} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Points paid" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, pointsPaid: value })) }))} value={activeForm.pointsPaid} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Mortgage insurance premiums" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, mortgageInsurancePremiums: value })) }))} value={activeForm.mortgageInsurancePremiums} />
          <SlimFieldRow focused={props.focusIndex === 7} label="Real estate taxes paid" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, realEstateTaxesPaid: value })) }))} value={activeForm.realEstateTaxesPaid} />
          <SlimFieldRow focused={props.focusIndex === 8} label="Property address line 1" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, propertyAddressLine1: value })) }))} value={activeForm.propertyAddressLine1} />
          <SlimFieldRow focused={props.focusIndex === 9} label="Property city" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, propertyAddressCity: value })) }))} value={activeForm.propertyAddressCity} />
          <SlimFieldRow focused={props.focusIndex === 10} label="Property state code" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, propertyAddressStateCode: value })) }))} value={activeForm.propertyAddressStateCode} />
          <SlimFieldRow focused={props.focusIndex === 11} label="Property postal code" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, propertyAddressPostalCode: value })) }))} value={activeForm.propertyAddressPostalCode} />
          <SlimFieldRow focused={props.focusIndex === 12} label="Property country code" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, propertyAddressCountryCode: value })) }))} value={activeForm.propertyAddressCountryCode} />
          <SelectFieldRow focused={props.focusIndex === 13} label="Secured debt used for home" onChange={(value) => props.updateDocuments((current) => ({ ...current, mortgageInterestForms: updateArrayEntry(current.mortgageInterestForms, props.selected1098Index, (entry) => ({ ...entry, securedDebtUsedForHome: value })) }))} options={securedDebtOptions} value={activeForm.securedDebtUsedForHome} />
        </box>
      )}
    </box>
  );
}

function Document1098EPanel(props: {
  readonly documents: InteractiveSupplementalFederalDraft["documents"];
  readonly focusIndex: number;
  readonly selected1098EIndex: number;
  readonly setSelected1098EIndex: (value: number) => void;
  readonly updateDocuments: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => void;
}) {
  const forms = props.documents.studentLoanForms;
  const activeForm = forms[props.selected1098EIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <text>1098-E rows also feed the fallback student loan interest deduction amount.</text>
      <RosterSelect emptyMessage="No 1098-E entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="1098-E entries" optionDescription={(entry) => `${entry.studentLoanInterestReceivedByLender || "0"} interest`} optionName={(entry, index) => `${index + 1}. ${entry.lenderName.trim().length > 0 ? entry.lenderName : "Untitled 1098-E"}`} selectedIndex={props.selected1098EIndex} setSelectedIndex={props.setSelected1098EIndex} />
      {activeForm == null ? <box border padding={1}><text>Add a 1098-E to capture student loan interest paid to a lender.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Lender name" onChange={(value) => props.updateDocuments((current) => ({ ...current, studentLoanForms: updateArrayEntry(current.studentLoanForms, props.selected1098EIndex, (entry) => ({ ...entry, lenderName: value })) }))} value={activeForm.lenderName} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Lender TIN" onChange={(value) => props.updateDocuments((current) => ({ ...current, studentLoanForms: updateArrayEntry(current.studentLoanForms, props.selected1098EIndex, (entry) => ({ ...entry, lenderTin: value })) }))} value={activeForm.lenderTin} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Student loan interest received by lender" onChange={(value) => props.updateDocuments((current) => ({ ...current, studentLoanForms: updateArrayEntry(current.studentLoanForms, props.selected1098EIndex, (entry) => ({ ...entry, studentLoanInterestReceivedByLender: value })) }))} value={activeForm.studentLoanInterestReceivedByLender} />
        </box>
      )}
    </box>
  );
}

function Document1098TPanel(props: {
  readonly documents: InteractiveSupplementalFederalDraft["documents"];
  readonly focusIndex: number;
  readonly knownPeople: string;
  readonly selected1098TIndex: number;
  readonly setSelected1098TIndex: (value: number) => void;
  readonly updateDocuments: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => void;
}) {
  const forms = props.documents.tuitionForms;
  const activeForm = forms[props.selected1098TIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.DIM}>Known people: {props.knownPeople}</text>
      <RosterSelect emptyMessage="No 1098-T entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="1098-T entries" optionDescription={(entry) => `${entry.qualifiedExpensesPaid || "0"} qualified expenses`} optionName={(entry, index) => `${index + 1}. ${entry.filerName.trim().length > 0 ? entry.filerName : "Untitled 1098-T"}`} selectedIndex={props.selected1098TIndex} setSelectedIndex={props.setSelected1098TIndex} />
      {activeForm == null ? <box border padding={1}><text>Add a 1098-T to capture education credit inputs.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Filer name" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, filerName: value })) }))} value={activeForm.filerName} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Filer TIN" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, filerTin: value })) }))} value={activeForm.filerTin} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Student person ID" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, studentPersonId: value })) }))} value={activeForm.studentPersonId} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Qualified expenses paid" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, qualifiedExpensesPaid: value })) }))} value={activeForm.qualifiedExpensesPaid} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Tax-free assistance" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, taxFreeAssistance: value })) }))} value={activeForm.taxFreeAssistance} />
          <BooleanSelectRow focused={props.focusIndex === 7} label="AOTC candidate" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, isAotcCandidate: value })) }))} value={activeForm.isAotcCandidate} />
          <BooleanSelectRow focused={props.focusIndex === 8} label="LLC candidate" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, isLlcCandidate: value })) }))} value={activeForm.isLlcCandidate} />
          <BooleanSelectRow focused={props.focusIndex === 9} label="Student half-time" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, studentHalfTime: value })) }))} value={activeForm.studentHalfTime} />
          <BooleanSelectRow focused={props.focusIndex === 10} label="Graduate student" onChange={(value) => props.updateDocuments((current) => ({ ...current, tuitionForms: updateArrayEntry(current.tuitionForms, props.selected1098TIndex, (entry) => ({ ...entry, graduateStudent: value })) }))} value={activeForm.graduateStudent} />
        </box>
      )}
    </box>
  );
}

function Document1095APanel(props: {
  readonly documents: InteractiveSupplementalFederalDraft["documents"];
  readonly focusIndex: number;
  readonly knownPeople: string;
  readonly selected1095AIndex: number;
  readonly selected1095AMonthlyRowIndex: number;
  readonly setSelected1095AIndex: (value: number) => void;
  readonly setSelected1095AMonthlyRowIndex: (value: number) => void;
  readonly updateDocuments: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["documents"],
    ) => InteractiveSupplementalFederalDraft["documents"],
  ) => void;
}) {
  const forms = props.documents.marketplaceForms;
  const activeForm = forms[props.selected1095AIndex] ?? null;
  const activeMonthlyRow = activeForm?.monthlyRows[props.selected1095AMonthlyRowIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.DIM}>Known people: {props.knownPeople}</text>
      <RosterSelect emptyMessage="No 1095-A entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="1095-A entries" optionDescription={(entry) => `${entry.marketplaceIdentifier || "marketplace pending"} / ${entry.monthlyRows.length} row(s)`} optionName={(entry, index) => `${index + 1}. ${entry.policyNumber.trim().length > 0 ? entry.policyNumber : "Untitled 1095-A"}`} selectedIndex={props.selected1095AIndex} setSelectedIndex={props.setSelected1095AIndex} />
      {activeForm == null ? <box border padding={1}><text>Add a 1095-A to capture premium tax credit monthly values.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Recipient person ID" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, recipientPersonId: value })) }))} value={activeForm.recipientPersonId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Marketplace identifier" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, marketplaceIdentifier: value })) }))} value={activeForm.marketplaceIdentifier} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Policy number" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, policyNumber: value })) }))} value={activeForm.policyNumber} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Covered person IDs" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, coveredPersonIds: value })) }))} value={activeForm.coveredPersonIds} />
          <RosterSelect emptyMessage="No monthly rows yet. Focus here and press `a`." focused={props.focusIndex === 6} items={activeForm.monthlyRows} label="Monthly rows" optionDescription={(entry) => `${entry.enrollmentPremium || "0"} enrollment / ${entry.advancePaymentOfPremiumTaxCredit || "0"} APTC`} optionName={(entry, index) => `${index + 1}. ${entry.month}`} selectedIndex={props.selected1095AMonthlyRowIndex} setSelectedIndex={props.setSelected1095AMonthlyRowIndex} />
          {activeMonthlyRow == null ? <box border padding={1}><text>Add a monthly row to edit annual or month-by-month marketplace values.</text></box> : (
            <box flexDirection="column" gap={1}>
              <SelectFieldRow focused={props.focusIndex === 7} label="Month" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, monthlyRows: updateArrayEntry(entry.monthlyRows, props.selected1095AMonthlyRowIndex, (row) => ({ ...row, month: value })) })) }))} options={marketplaceMonthOptions} value={marketplaceMonthValues.includes(activeMonthlyRow.month as (typeof marketplaceMonthValues)[number]) ? (activeMonthlyRow.month as (typeof marketplaceMonthValues)[number]) : "annual"} />
              <SlimFieldRow focused={props.focusIndex === 8} label="Enrollment premium" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, monthlyRows: updateArrayEntry(entry.monthlyRows, props.selected1095AMonthlyRowIndex, (row) => ({ ...row, enrollmentPremium: value })) })) }))} value={activeMonthlyRow.enrollmentPremium} />
              <SlimFieldRow focused={props.focusIndex === 9} label="SLCSP premium" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, monthlyRows: updateArrayEntry(entry.monthlyRows, props.selected1095AMonthlyRowIndex, (row) => ({ ...row, secondLowestCostSilverPlanPremium: value })) })) }))} value={activeMonthlyRow.secondLowestCostSilverPlanPremium} />
              <SlimFieldRow focused={props.focusIndex === 10} label="Advance PTC" onChange={(value) => props.updateDocuments((current) => ({ ...current, marketplaceForms: updateArrayEntry(current.marketplaceForms, props.selected1095AIndex, (entry) => ({ ...entry, monthlyRows: updateArrayEntry(entry.monthlyRows, props.selected1095AMonthlyRowIndex, (row) => ({ ...row, advancePaymentOfPremiumTaxCredit: value })) })) }))} value={activeMonthlyRow.advancePaymentOfPremiumTaxCredit} />
            </box>
          )}
        </box>
      )}
    </box>
  );
}

function Income1099NecPanel(props: {
  readonly focusIndex: number;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (value: number) => void;
  readonly supplementalIncome: InteractiveSupplementalFederalDraft["supplementalIncome"];
  readonly updateSupplementalIncome: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["supplementalIncome"],
    ) => InteractiveSupplementalFederalDraft["supplementalIncome"],
  ) => void;
}) {
  const forms = props.supplementalIncome.necForms;
  const activeForm = forms[props.selectedIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No 1099-NEC entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="1099-NEC entries" optionDescription={(entry) => `${entry.amount || "0"} amount / ${entry.linkedBusinessId || "no linked business"}`} optionName={(entry, index) => `${index + 1}. ${entry.payerName.trim().length > 0 ? entry.payerName : "Untitled 1099-NEC"}`} selectedIndex={props.selectedIndex} setSelectedIndex={props.setSelectedIndex} />
      {activeForm == null ? <box border padding={1}><text>Add a 1099-NEC to capture nonemployee compensation.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, necForms: updateArrayEntry(current.necForms, props.selectedIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeForm.personId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Payer name" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, necForms: updateArrayEntry(current.necForms, props.selectedIndex, (entry) => ({ ...entry, payerName: value })) }))} value={activeForm.payerName} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Payer TIN" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, necForms: updateArrayEntry(current.necForms, props.selectedIndex, (entry) => ({ ...entry, payerTin: value })) }))} value={activeForm.payerTin} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Amount" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, necForms: updateArrayEntry(current.necForms, props.selectedIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeForm.amount} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Federal withholding" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, necForms: updateArrayEntry(current.necForms, props.selectedIndex, (entry) => ({ ...entry, federalIncomeTaxWithheld: value })) }))} value={activeForm.federalIncomeTaxWithheld} />
          <SlimFieldRow focused={props.focusIndex === 7} label="Linked Schedule C business ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, necForms: updateArrayEntry(current.necForms, props.selectedIndex, (entry) => ({ ...entry, linkedBusinessId: value })) }))} value={activeForm.linkedBusinessId} />
        </box>
      )}
    </box>
  );
}

function Income1099MiscPanel(props: {
  readonly focusIndex: number;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (value: number) => void;
  readonly supplementalIncome: InteractiveSupplementalFederalDraft["supplementalIncome"];
  readonly updateSupplementalIncome: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["supplementalIncome"],
    ) => InteractiveSupplementalFederalDraft["supplementalIncome"],
  ) => void;
}) {
  const forms = props.supplementalIncome.miscForms;
  const activeForm = forms[props.selectedIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No 1099-MISC entries yet. Focus here and press `a`." focused={props.focusIndex === 1} items={forms} label="1099-MISC entries" optionDescription={(entry) => `${entry.otherIncome || entry.rents || "0"} primary amount`} optionName={(entry, index) => `${index + 1}. ${entry.payerName.trim().length > 0 ? entry.payerName : "Untitled 1099-MISC"}`} selectedIndex={props.selectedIndex} setSelectedIndex={props.setSelectedIndex} />
      {activeForm == null ? <box border padding={1}><text>Add a 1099-MISC to edit the federal categories it can feed.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeForm.personId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Payer name" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, payerName: value })) }))} value={activeForm.payerName} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Payer TIN" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, payerTin: value })) }))} value={activeForm.payerTin} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Rents" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, rents: value })) }))} value={activeForm.rents} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Royalties" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, royalties: value })) }))} value={activeForm.royalties} />
          <SlimFieldRow focused={props.focusIndex === 7} label="Other income" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, otherIncome: value })) }))} value={activeForm.otherIncome} />
          <SlimFieldRow focused={props.focusIndex === 8} label="Fishing boat proceeds" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, fishingBoatProceeds: value })) }))} value={activeForm.fishingBoatProceeds} />
          <SlimFieldRow focused={props.focusIndex === 9} label="Medical and health care payments" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, medicalAndHealthCarePayments: value })) }))} value={activeForm.medicalAndHealthCarePayments} />
          <SlimFieldRow focused={props.focusIndex === 10} label="Crop insurance proceeds" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, cropInsuranceProceeds: value })) }))} value={activeForm.cropInsuranceProceeds} />
          <SlimFieldRow focused={props.focusIndex === 11} label="Gross proceeds paid to attorney" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, grossProceedsPaidToAttorney: value })) }))} value={activeForm.grossProceedsPaidToAttorney} />
          <SlimFieldRow focused={props.focusIndex === 12} label="Substitute payments in lieu of dividends or interest" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, substitutePaymentsInLieuOfDividendsOrInterest: value })) }))} value={activeForm.substitutePaymentsInLieuOfDividendsOrInterest} />
          <SlimFieldRow focused={props.focusIndex === 13} label="Section 409A deferrals" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, section409aDeferrals: value })) }))} value={activeForm.section409aDeferrals} />
          <SlimFieldRow focused={props.focusIndex === 14} label="Nonqualified deferred compensation" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, nonqualifiedDeferredCompensation: value })) }))} value={activeForm.nonqualifiedDeferredCompensation} />
          <SlimFieldRow focused={props.focusIndex === 15} label="Federal withholding" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, miscForms: updateArrayEntry(current.miscForms, props.selectedIndex, (entry) => ({ ...entry, federalIncomeTaxWithheld: value })) }))} value={activeForm.federalIncomeTaxWithheld} />
        </box>
      )}
    </box>
  );
}

function IncomeScheduleCPanel(props: {
  readonly focusIndex: number;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (value: number) => void;
  readonly supplementalIncome: InteractiveSupplementalFederalDraft["supplementalIncome"];
  readonly updateSupplementalIncome: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["supplementalIncome"],
    ) => InteractiveSupplementalFederalDraft["supplementalIncome"],
  ) => void;
}) {
  const businesses = props.supplementalIncome.scheduleCBusinesses;
  const activeBusiness = businesses[props.selectedIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No Schedule C businesses yet. Focus here and press `a`." focused={props.focusIndex === 1} items={businesses} label="Schedule C businesses" optionDescription={(entry) => `${entry.grossReceiptsOrSales || "0"} gross receipts`} optionName={(entry, index) => `${index + 1}. ${entry.businessName.trim().length > 0 ? entry.businessName : entry.businessId || "Untitled business"}`} selectedIndex={props.selectedIndex} setSelectedIndex={props.setSelectedIndex} />
      {activeBusiness == null ? <box border padding={1}><text>Add a Schedule C business to capture self-employment inputs.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Owner person ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, ownerPersonId: value })) }))} value={activeBusiness.ownerPersonId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Business ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, businessId: value })) }))} value={activeBusiness.businessId} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Business name" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, businessName: value })) }))} value={activeBusiness.businessName} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Business EIN" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, businessEin: value })) }))} value={activeBusiness.businessEin} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Principal business code" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, principalBusinessCode: value })) }))} value={activeBusiness.principalBusinessCode} />
          <SelectFieldRow focused={props.focusIndex === 7} label="Accounting method" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, accountingMethod: value })) }))} options={accountingMethodOptions} value={accountingMethodValues.includes(activeBusiness.accountingMethod as (typeof accountingMethodValues)[number]) ? (activeBusiness.accountingMethod as (typeof accountingMethodValues)[number]) : "cash"} />
          <BooleanSelectRow focused={props.focusIndex === 8} label="Materially participates" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, materiallyParticipates: value })) }))} value={activeBusiness.materiallyParticipates} />
          <SlimFieldRow focused={props.focusIndex === 9} label="Gross receipts or sales" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, grossReceiptsOrSales: value })) }))} value={activeBusiness.grossReceiptsOrSales} />
          <SlimFieldRow focused={props.focusIndex === 10} label="Returns and allowances" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, returnsAndAllowances: value })) }))} value={activeBusiness.returnsAndAllowances} />
          <SlimFieldRow focused={props.focusIndex === 11} label="Cost of goods sold" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, costOfGoodsSold: value })) }))} value={activeBusiness.costOfGoodsSold} />
          <SlimFieldRow focused={props.focusIndex === 12} label="Other business income" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, otherBusinessIncome: value })) }))} value={activeBusiness.otherBusinessIncome} />
          <SlimFieldRow focused={props.focusIndex === 13} label="Total expenses" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, totalExpenses: value })) }))} value={activeBusiness.totalExpenses} />
          <SlimFieldRow focused={props.focusIndex === 14} label="Home office deduction" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, homeOfficeDeduction: value })) }))} value={activeBusiness.homeOfficeDeduction} />
          <SelectFieldRow focused={props.focusIndex === 15} label="Vehicle expense method" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, vehicleExpenseMethod: value })) }))} options={vehicleExpenseMethodOptions} value={vehicleExpenseMethodValues.includes(activeBusiness.vehicleExpenseMethod as (typeof vehicleExpenseMethodValues)[number]) ? (activeBusiness.vehicleExpenseMethod as (typeof vehicleExpenseMethodValues)[number]) : "standard_mileage"} />
          <SlimFieldRow focused={props.focusIndex === 16} label="Source document IDs" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleCBusinesses: updateArrayEntry(current.scheduleCBusinesses, props.selectedIndex, (entry) => ({ ...entry, sourceDocumentIds: value })) }))} value={activeBusiness.sourceDocumentIds} />
        </box>
      )}
    </box>
  );
}

function IncomeScheduleEPanel(props: {
  readonly focusIndex: number;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (value: number) => void;
  readonly supplementalIncome: InteractiveSupplementalFederalDraft["supplementalIncome"];
  readonly updateSupplementalIncome: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["supplementalIncome"],
    ) => InteractiveSupplementalFederalDraft["supplementalIncome"],
  ) => void;
}) {
  const activities = props.supplementalIncome.scheduleEActivities;
  const activeActivity = activities[props.selectedIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No Schedule E activities yet. Focus here and press `a`." focused={props.focusIndex === 1} items={activities} label="Schedule E activities" optionDescription={(entry) => `${entry.totalIncome || "0"} income / ${entry.totalExpenses || "0"} expenses`} optionName={(entry, index) => `${index + 1}. ${entry.entityName.trim().length > 0 ? entry.entityName : entry.activityId || "Untitled activity"}`} selectedIndex={props.selectedIndex} setSelectedIndex={props.setSelectedIndex} />
      {activeActivity == null ? <box border padding={1}><text>Add a Schedule E activity to capture rental or pass-through data.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Owner person ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, ownerPersonId: value })) }))} value={activeActivity.ownerPersonId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Activity ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, activityId: value })) }))} value={activeActivity.activityId} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Activity type" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, activityType: value })) }))} value={activeActivity.activityType} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Entity name" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, entityName: value })) }))} value={activeActivity.entityName} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Entity EIN" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, entityEin: value })) }))} value={activeActivity.entityEin} />
          <SelectFieldRow focused={props.focusIndex === 7} label="Materially participates" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, materiallyParticipates: value })) }))} options={participationOptions} value={activeActivity.materiallyParticipates} />
          <SlimFieldRow focused={props.focusIndex === 8} label="Total income" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, totalIncome: value })) }))} value={activeActivity.totalIncome} />
          <SlimFieldRow focused={props.focusIndex === 9} label="Total expenses" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, totalExpenses: value })) }))} value={activeActivity.totalExpenses} />
          <SlimFieldRow focused={props.focusIndex === 10} label="Source document IDs" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, scheduleEActivities: updateArrayEntry(current.scheduleEActivities, props.selectedIndex, (entry) => ({ ...entry, sourceDocumentIds: value })) }))} value={activeActivity.sourceDocumentIds} />
        </box>
      )}
    </box>
  );
}

function IncomeOtherPanel(props: {
  readonly focusIndex: number;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (value: number) => void;
  readonly supplementalIncome: InteractiveSupplementalFederalDraft["supplementalIncome"];
  readonly updateSupplementalIncome: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["supplementalIncome"],
    ) => InteractiveSupplementalFederalDraft["supplementalIncome"],
  ) => void;
}) {
  const items = props.supplementalIncome.otherIncomeItems;
  const activeItem = items[props.selectedIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No other income items yet. Focus here and press `a`." focused={props.focusIndex === 1} items={items} label="Other income items" optionDescription={(entry) => `${entry.amount || "0"} / ${entry.schedule1Category || "category pending"}`} optionName={(entry, index) => `${index + 1}. ${entry.description.trim().length > 0 ? entry.description : entry.otherIncomeId || "Untitled income item"}`} selectedIndex={props.selectedIndex} setSelectedIndex={props.setSelectedIndex} />
      {activeItem == null ? <box border padding={1}><text>Add an other-income row to capture Schedule 1 income not covered by another form editor.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, otherIncomeItems: updateArrayEntry(current.otherIncomeItems, props.selectedIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeItem.personId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Other income ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, otherIncomeItems: updateArrayEntry(current.otherIncomeItems, props.selectedIndex, (entry) => ({ ...entry, otherIncomeId: value })) }))} value={activeItem.otherIncomeId} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Description" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, otherIncomeItems: updateArrayEntry(current.otherIncomeItems, props.selectedIndex, (entry) => ({ ...entry, description: value })) }))} value={activeItem.description} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Amount" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, otherIncomeItems: updateArrayEntry(current.otherIncomeItems, props.selectedIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeItem.amount} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Schedule 1 category" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, otherIncomeItems: updateArrayEntry(current.otherIncomeItems, props.selectedIndex, (entry) => ({ ...entry, schedule1Category: value })) }))} value={activeItem.schedule1Category} />
          <SlimFieldRow focused={props.focusIndex === 7} label="Source document IDs" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, otherIncomeItems: updateArrayEntry(current.otherIncomeItems, props.selectedIndex, (entry) => ({ ...entry, sourceDocumentIds: value })) }))} value={activeItem.sourceDocumentIds} />
        </box>
      )}
    </box>
  );
}

function SupplementalWithholdingsPanel(props: {
  readonly focusIndex: number;
  readonly selectedIndex: number;
  readonly setSelectedIndex: (value: number) => void;
  readonly supplementalIncome: InteractiveSupplementalFederalDraft["supplementalIncome"];
  readonly updateSupplementalIncome: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["supplementalIncome"],
    ) => InteractiveSupplementalFederalDraft["supplementalIncome"],
  ) => void;
}) {
  const withholdings = props.supplementalIncome.supplementalWithholdings;
  const activeWithholding = withholdings[props.selectedIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <text>Use this only for federal withholding rows not auto-generated from a dedicated form screen.</text>
      <RosterSelect emptyMessage="No supplemental federal withholding rows yet. Focus here and press `a`." focused={props.focusIndex === 1} items={withholdings} label="Supplemental withholdings" optionDescription={(entry) => `${entry.amount || "0"} / ${entry.description || "description pending"}`} optionName={(entry, index) => `${index + 1}. ${entry.withholdingId || "Untitled withholding"}`} selectedIndex={props.selectedIndex} setSelectedIndex={props.setSelectedIndex} />
      {activeWithholding == null ? <box border padding={1}><text>Add a withholding row for a document or fact that does not already generate federal withholding.</text></box> : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, supplementalWithholdings: updateArrayEntry(current.supplementalWithholdings, props.selectedIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeWithholding.personId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Withholding ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, supplementalWithholdings: updateArrayEntry(current.supplementalWithholdings, props.selectedIndex, (entry) => ({ ...entry, withholdingId: value })) }))} value={activeWithholding.withholdingId} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Source document ID" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, supplementalWithholdings: updateArrayEntry(current.supplementalWithholdings, props.selectedIndex, (entry) => ({ ...entry, sourceDocumentId: value })) }))} value={activeWithholding.sourceDocumentId} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Amount" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, supplementalWithholdings: updateArrayEntry(current.supplementalWithholdings, props.selectedIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeWithholding.amount} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Description" onChange={(value) => props.updateSupplementalIncome((current) => ({ ...current, supplementalWithholdings: updateArrayEntry(current.supplementalWithholdings, props.selectedIndex, (entry) => ({ ...entry, description: value })) }))} value={activeWithholding.description} />
        </box>
      )}
    </box>
  );
}

function AdjustmentsPanel(props: {
  readonly deductions: InteractiveSupplementalFederalDraft["deductions"];
  readonly focusIndex: number;
  readonly selectedOtherAdjustmentIndex: number;
  readonly setSelectedOtherAdjustmentIndex: (value: number) => void;
  readonly updateDeductions: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["deductions"],
    ) => InteractiveSupplementalFederalDraft["deductions"],
  ) => void;
}) {
  const activeOtherAdjustment =
    props.deductions.otherAdjustments[props.selectedOtherAdjustmentIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <SlimFieldRow focused={props.focusIndex === 1} label="Educator expenses" onChange={(value) => props.updateDeductions((current) => ({ ...current, educatorExpenses: value }))} value={props.deductions.educatorExpenses} />
      <SlimFieldRow focused={props.focusIndex === 2} label="Reservist or artist expenses" onChange={(value) => props.updateDeductions((current) => ({ ...current, reservistExpenses: value }))} value={props.deductions.reservistExpenses} />
      <SlimFieldRow focused={props.focusIndex === 3} label="HSA deduction" onChange={(value) => props.updateDeductions((current) => ({ ...current, healthSavingsAccountDeduction: value }))} value={props.deductions.healthSavingsAccountDeduction} />
      <SlimFieldRow focused={props.focusIndex === 4} label="Moving expenses for armed forces" onChange={(value) => props.updateDeductions((current) => ({ ...current, movingExpensesForArmedForces: value }))} value={props.deductions.movingExpensesForArmedForces} />
      <SlimFieldRow focused={props.focusIndex === 5} label="Deductible part of self-employment tax" onChange={(value) => props.updateDeductions((current) => ({ ...current, deductiblePartOfSelfEmploymentTax: value }))} value={props.deductions.deductiblePartOfSelfEmploymentTax} />
      <SlimFieldRow focused={props.focusIndex === 6} label="Self-employed SEP SIMPLE and qualified plans" onChange={(value) => props.updateDeductions((current) => ({ ...current, selfEmployedSepSimpleAndQualifiedPlans: value }))} value={props.deductions.selfEmployedSepSimpleAndQualifiedPlans} />
      <SlimFieldRow focused={props.focusIndex === 7} label="Self-employed health insurance" onChange={(value) => props.updateDeductions((current) => ({ ...current, selfEmployedHealthInsurance: value }))} value={props.deductions.selfEmployedHealthInsurance} />
      <SlimFieldRow focused={props.focusIndex === 8} label="Penalty on early withdrawal of savings" onChange={(value) => props.updateDeductions((current) => ({ ...current, penaltyOnEarlyWithdrawalOfSavings: value }))} value={props.deductions.penaltyOnEarlyWithdrawalOfSavings} />
      <SlimFieldRow focused={props.focusIndex === 9} label="Alimony paid for pre-2019 divorce" onChange={(value) => props.updateDeductions((current) => ({ ...current, alimonyPaidForPre2019Divorce: value }))} value={props.deductions.alimonyPaidForPre2019Divorce} />
      <SlimFieldRow focused={props.focusIndex === 10} label="IRA deduction" onChange={(value) => props.updateDeductions((current) => ({ ...current, iraDeduction: value }))} value={props.deductions.iraDeduction} />
      <SlimFieldRow focused={props.focusIndex === 11} label="Student loan interest deduction override" onChange={(value) => props.updateDeductions((current) => ({ ...current, studentLoanInterestDeduction: value }))} value={props.deductions.studentLoanInterestDeduction} />
      <RosterSelect emptyMessage="No other adjustments yet. Focus here and press `a`." focused={props.focusIndex === 12} items={props.deductions.otherAdjustments} label="Other adjustments" optionDescription={(entry) => `${entry.amount || "0"} / ${entry.personId || "no person"}`} optionName={(entry, index) => `${index + 1}. ${entry.description.trim().length > 0 ? entry.description : "Untitled adjustment"}`} selectedIndex={props.selectedOtherAdjustmentIndex} setSelectedIndex={props.setSelectedOtherAdjustmentIndex} />
      {activeOtherAdjustment == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 13} label="Adjustment code" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherAdjustments: updateArrayEntry(current.otherAdjustments, props.selectedOtherAdjustmentIndex, (entry) => ({ ...entry, code: value })) }))} value={activeOtherAdjustment.code} />
          <SlimFieldRow focused={props.focusIndex === 14} label="Description" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherAdjustments: updateArrayEntry(current.otherAdjustments, props.selectedOtherAdjustmentIndex, (entry) => ({ ...entry, description: value })) }))} value={activeOtherAdjustment.description} />
          <SlimFieldRow focused={props.focusIndex === 15} label="Amount" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherAdjustments: updateArrayEntry(current.otherAdjustments, props.selectedOtherAdjustmentIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeOtherAdjustment.amount} />
          <SlimFieldRow focused={props.focusIndex === 16} label="Person ID" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherAdjustments: updateArrayEntry(current.otherAdjustments, props.selectedOtherAdjustmentIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeOtherAdjustment.personId} />
          <SlimFieldRow focused={props.focusIndex === 17} label="Source document ID" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherAdjustments: updateArrayEntry(current.otherAdjustments, props.selectedOtherAdjustmentIndex, (entry) => ({ ...entry, sourceDocumentId: value })) }))} value={activeOtherAdjustment.sourceDocumentId} />
        </box>
      )}
    </box>
  );
}

function ItemizedPanel(props: {
  readonly deductions: InteractiveSupplementalFederalDraft["deductions"];
  readonly focusIndex: number;
  readonly selectedOtherItemizedDeductionIndex: number;
  readonly setSelectedOtherItemizedDeductionIndex: (value: number) => void;
  readonly updateDeductions: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["deductions"],
    ) => InteractiveSupplementalFederalDraft["deductions"],
  ) => void;
}) {
  const activeOtherItemized =
    props.deductions.otherItemizedDeductions[props.selectedOtherItemizedDeductionIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <SlimFieldRow focused={props.focusIndex === 1} label="Medical and dental expenses" onChange={(value) => props.updateDeductions((current) => ({ ...current, medicalAndDentalExpenses: value }))} value={props.deductions.medicalAndDentalExpenses} />
      <SlimFieldRow focused={props.focusIndex === 2} label="State and local income or sales taxes" onChange={(value) => props.updateDeductions((current) => ({ ...current, stateAndLocalIncomeOrSalesTaxes: value }))} value={props.deductions.stateAndLocalIncomeOrSalesTaxes} />
      <SlimFieldRow focused={props.focusIndex === 3} label="Real estate taxes" onChange={(value) => props.updateDeductions((current) => ({ ...current, realEstateTaxes: value }))} value={props.deductions.realEstateTaxes} />
      <SlimFieldRow focused={props.focusIndex === 4} label="Personal property taxes" onChange={(value) => props.updateDeductions((current) => ({ ...current, personalPropertyTaxes: value }))} value={props.deductions.personalPropertyTaxes} />
      <SlimFieldRow focused={props.focusIndex === 5} label="Other taxes" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherTaxes: value }))} value={props.deductions.otherTaxes} />
      <SlimFieldRow focused={props.focusIndex === 6} label="Charitable cash contributions" onChange={(value) => props.updateDeductions((current) => ({ ...current, charitableCashContributions: value }))} value={props.deductions.charitableCashContributions} />
      <SlimFieldRow focused={props.focusIndex === 7} label="Charitable noncash contributions" onChange={(value) => props.updateDeductions((current) => ({ ...current, charitableNoncashContributions: value }))} value={props.deductions.charitableNoncashContributions} />
      <SlimFieldRow focused={props.focusIndex === 8} label="Casualty and theft losses" onChange={(value) => props.updateDeductions((current) => ({ ...current, casualtyAndTheftLosses: value }))} value={props.deductions.casualtyAndTheftLosses} />
      <RosterSelect emptyMessage="No other itemized deductions yet. Focus here and press `a`." focused={props.focusIndex === 9} items={props.deductions.otherItemizedDeductions} label="Other itemized deductions" optionDescription={(entry) => `${entry.amount || "0"} / ${entry.personId || "no person"}`} optionName={(entry, index) => `${index + 1}. ${entry.description.trim().length > 0 ? entry.description : "Untitled itemized deduction"}`} selectedIndex={props.selectedOtherItemizedDeductionIndex} setSelectedIndex={props.setSelectedOtherItemizedDeductionIndex} />
      {activeOtherItemized == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 10} label="Deduction code" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherItemizedDeductions: updateArrayEntry(current.otherItemizedDeductions, props.selectedOtherItemizedDeductionIndex, (entry) => ({ ...entry, code: value })) }))} value={activeOtherItemized.code} />
          <SlimFieldRow focused={props.focusIndex === 11} label="Description" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherItemizedDeductions: updateArrayEntry(current.otherItemizedDeductions, props.selectedOtherItemizedDeductionIndex, (entry) => ({ ...entry, description: value })) }))} value={activeOtherItemized.description} />
          <SlimFieldRow focused={props.focusIndex === 12} label="Amount" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherItemizedDeductions: updateArrayEntry(current.otherItemizedDeductions, props.selectedOtherItemizedDeductionIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeOtherItemized.amount} />
          <SlimFieldRow focused={props.focusIndex === 13} label="Person ID" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherItemizedDeductions: updateArrayEntry(current.otherItemizedDeductions, props.selectedOtherItemizedDeductionIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeOtherItemized.personId} />
          <SlimFieldRow focused={props.focusIndex === 14} label="Source document ID" onChange={(value) => props.updateDeductions((current) => ({ ...current, otherItemizedDeductions: updateArrayEntry(current.otherItemizedDeductions, props.selectedOtherItemizedDeductionIndex, (entry) => ({ ...entry, sourceDocumentId: value })) }))} value={activeOtherItemized.sourceDocumentId} />
        </box>
      )}
    </box>
  );
}

function CreditCandidatesPanel(props: {
  readonly credits: InteractiveSupplementalFederalDraft["credits"];
  readonly focusIndex: number;
  readonly updateCredits: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => void;
}) {
  return (
    <box flexDirection="column" gap={1}>
      <SlimFieldRow focused={props.focusIndex === 1} label="Candidate child tax credit dependent IDs" onChange={(value) => props.updateCredits((current) => ({ ...current, candidateChildTaxCreditDependentIds: value }))} value={props.credits.candidateChildTaxCreditDependentIds} />
      <SlimFieldRow focused={props.focusIndex === 2} label="Candidate credit for other dependent IDs" onChange={(value) => props.updateCredits((current) => ({ ...current, candidateCreditForOtherDependentIds: value }))} value={props.credits.candidateCreditForOtherDependentIds} />
      <SlimFieldRow focused={props.focusIndex === 3} label="Candidate EITC child IDs" onChange={(value) => props.updateCredits((current) => ({ ...current, candidateEitcChildIds: value }))} value={props.credits.candidateEitcChildIds} />
      <SlimFieldRow focused={props.focusIndex === 4} label="Retirement savings credit candidate person IDs" onChange={(value) => props.updateCredits((current) => ({ ...current, retirementSavingsContributionsCreditCandidatePersonIds: value }))} value={props.credits.retirementSavingsContributionsCreditCandidatePersonIds} />
    </box>
  );
}

function CreditCareProvidersPanel(props: {
  readonly credits: InteractiveSupplementalFederalDraft["credits"];
  readonly focusIndex: number;
  readonly knownPeople: string;
  readonly selectedCareProviderIndex: number;
  readonly setSelectedCareProviderIndex: (value: number) => void;
  readonly updateCredits: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => void;
}) {
  const activeProvider = props.credits.careProviders[props.selectedCareProviderIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.DIM}>Known people: {props.knownPeople}</text>
      <SlimFieldRow focused={props.focusIndex === 1} label="Qualifying person IDs" onChange={(value) => props.updateCredits((current) => ({ ...current, qualifyingPersonIdsForCare: value }))} value={props.credits.qualifyingPersonIdsForCare} />
      <RosterSelect emptyMessage="No care providers yet. Focus here and press `a`." focused={props.focusIndex === 2} items={props.credits.careProviders} label="Care providers" optionDescription={(entry) => `${entry.last4Tin || "TIN pending"} / ${entry.addressCity || "city pending"}`} optionName={(entry, index) => `${index + 1}. ${entry.name.trim().length > 0 ? entry.name : entry.providerId || "Untitled provider"}`} selectedIndex={props.selectedCareProviderIndex} setSelectedIndex={props.setSelectedCareProviderIndex} />
      {activeProvider == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 3} label="Provider ID" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, providerId: value })) }))} value={activeProvider.providerId} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Provider name" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, name: value })) }))} value={activeProvider.name} />
          <SlimFieldRow focused={props.focusIndex === 5} label="TIN token" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, tinToken: value })) }))} value={activeProvider.tinToken} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Last 4 TIN" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, last4Tin: value })) }))} value={activeProvider.last4Tin} />
          <SlimFieldRow focused={props.focusIndex === 7} label="Address line 1" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, addressLine1: value })) }))} value={activeProvider.addressLine1} />
          <SlimFieldRow focused={props.focusIndex === 8} label="City" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, addressCity: value })) }))} value={activeProvider.addressCity} />
          <SlimFieldRow focused={props.focusIndex === 9} label="State code" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, addressStateCode: value })) }))} value={activeProvider.addressStateCode} />
          <SlimFieldRow focused={props.focusIndex === 10} label="Postal code" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, addressPostalCode: value })) }))} value={activeProvider.addressPostalCode} />
          <SlimFieldRow focused={props.focusIndex === 11} label="Country code" onChange={(value) => props.updateCredits((current) => ({ ...current, careProviders: updateArrayEntry(current.careProviders, props.selectedCareProviderIndex, (entry) => ({ ...entry, addressCountryCode: value })) }))} value={activeProvider.addressCountryCode} />
        </box>
      )}
    </box>
  );
}

function CreditCareExpensesPanel(props: {
  readonly credits: InteractiveSupplementalFederalDraft["credits"];
  readonly focusIndex: number;
  readonly selectedCareExpenseIndex: number;
  readonly setSelectedCareExpenseIndex: (value: number) => void;
  readonly updateCredits: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => void;
}) {
  const activeExpense = props.credits.careExpenses[props.selectedCareExpenseIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No care expenses yet. Focus here and press `a`." focused={props.focusIndex === 1} items={props.credits.careExpenses} label="Care expenses" optionDescription={(entry) => `${entry.amount || "0"} / ${entry.monthsOfCare || "months pending"} months`} optionName={(entry, index) => `${index + 1}. ${entry.personId || "Untitled care expense"}`} selectedIndex={props.selectedCareExpenseIndex} setSelectedIndex={props.setSelectedCareExpenseIndex} />
      {activeExpense == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateCredits((current) => ({ ...current, careExpenses: updateArrayEntry(current.careExpenses, props.selectedCareExpenseIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeExpense.personId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Provider ID" onChange={(value) => props.updateCredits((current) => ({ ...current, careExpenses: updateArrayEntry(current.careExpenses, props.selectedCareExpenseIndex, (entry) => ({ ...entry, providerId: value })) }))} value={activeExpense.providerId} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Amount" onChange={(value) => props.updateCredits((current) => ({ ...current, careExpenses: updateArrayEntry(current.careExpenses, props.selectedCareExpenseIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeExpense.amount} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Months of care" onChange={(value) => props.updateCredits((current) => ({ ...current, careExpenses: updateArrayEntry(current.careExpenses, props.selectedCareExpenseIndex, (entry) => ({ ...entry, monthsOfCare: value })) }))} value={activeExpense.monthsOfCare} />
        </box>
      )}
    </box>
  );
}

function CreditEnergyPanel(props: {
  readonly credits: InteractiveSupplementalFederalDraft["credits"];
  readonly focusIndex: number;
  readonly selectedEnergyProjectIndex: number;
  readonly setSelectedEnergyProjectIndex: (value: number) => void;
  readonly updateCredits: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => void;
}) {
  const activeProject =
    props.credits.residentialCleanEnergyProjects[props.selectedEnergyProjectIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No clean-energy projects yet. Focus here and press `a`." focused={props.focusIndex === 1} items={props.credits.residentialCleanEnergyProjects} label="Residential clean energy projects" optionDescription={(entry) => `${entry.qualifiedCost || "0"} qualified cost`} optionName={(entry, index) => `${index + 1}. ${entry.creditCategory || entry.projectId || "Untitled project"}`} selectedIndex={props.selectedEnergyProjectIndex} setSelectedIndex={props.setSelectedEnergyProjectIndex} />
      {activeProject == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Project ID" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, projectId: value })) }))} value={activeProject.projectId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Credit category" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, creditCategory: value })) }))} value={activeProject.creditCategory} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Qualified cost" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, qualifiedCost: value })) }))} value={activeProject.qualifiedCost} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Placed in service date" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, placedInServiceDate: value })) }))} value={activeProject.placedInServiceDate} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Property address line 1" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, propertyAddressLine1: value })) }))} value={activeProject.propertyAddressLine1} />
          <SlimFieldRow focused={props.focusIndex === 7} label="City" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, propertyAddressCity: value })) }))} value={activeProject.propertyAddressCity} />
          <SlimFieldRow focused={props.focusIndex === 8} label="State code" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, propertyAddressStateCode: value })) }))} value={activeProject.propertyAddressStateCode} />
          <SlimFieldRow focused={props.focusIndex === 9} label="Postal code" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, propertyAddressPostalCode: value })) }))} value={activeProject.propertyAddressPostalCode} />
          <SlimFieldRow focused={props.focusIndex === 10} label="Country code" onChange={(value) => props.updateCredits((current) => ({ ...current, residentialCleanEnergyProjects: updateArrayEntry(current.residentialCleanEnergyProjects, props.selectedEnergyProjectIndex, (entry) => ({ ...entry, propertyAddressCountryCode: value })) }))} value={activeProject.propertyAddressCountryCode} />
        </box>
      )}
    </box>
  );
}

function CreditVehiclesPanel(props: {
  readonly credits: InteractiveSupplementalFederalDraft["credits"];
  readonly focusIndex: number;
  readonly selectedVehicleCreditIndex: number;
  readonly setSelectedVehicleCreditIndex: (value: number) => void;
  readonly updateCredits: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => void;
}) {
  const activeVehicle = props.credits.cleanVehicleCredits[props.selectedVehicleCreditIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No clean-vehicle credit claims yet. Focus here and press `a`." focused={props.focusIndex === 1} items={props.credits.cleanVehicleCredits} label="Clean vehicle credit claims" optionDescription={(entry) => `${entry.tentativeCredit || "0"} tentative credit`} optionName={(entry, index) => `${index + 1}. ${entry.vinLast8.trim().length > 0 ? entry.vinLast8 : entry.vehicleClaimId || "Untitled vehicle claim"}`} selectedIndex={props.selectedVehicleCreditIndex} setSelectedIndex={props.setSelectedVehicleCreditIndex} />
      {activeVehicle == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Vehicle claim ID" onChange={(value) => props.updateCredits((current) => ({ ...current, cleanVehicleCredits: updateArrayEntry(current.cleanVehicleCredits, props.selectedVehicleCreditIndex, (entry) => ({ ...entry, vehicleClaimId: value })) }))} value={activeVehicle.vehicleClaimId} />
          <SlimFieldRow focused={props.focusIndex === 3} label="VIN last 8" onChange={(value) => props.updateCredits((current) => ({ ...current, cleanVehicleCredits: updateArrayEntry(current.cleanVehicleCredits, props.selectedVehicleCreditIndex, (entry) => ({ ...entry, vinLast8: value })) }))} value={activeVehicle.vinLast8} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Clean vehicle type" onChange={(value) => props.updateCredits((current) => ({ ...current, cleanVehicleCredits: updateArrayEntry(current.cleanVehicleCredits, props.selectedVehicleCreditIndex, (entry) => ({ ...entry, cleanVehicleType: value })) }))} value={activeVehicle.cleanVehicleType} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Purchase date" onChange={(value) => props.updateCredits((current) => ({ ...current, cleanVehicleCredits: updateArrayEntry(current.cleanVehicleCredits, props.selectedVehicleCreditIndex, (entry) => ({ ...entry, purchaseDate: value })) }))} value={activeVehicle.purchaseDate} />
          <SlimFieldRow focused={props.focusIndex === 6} label="MSRP or sales price" onChange={(value) => props.updateCredits((current) => ({ ...current, cleanVehicleCredits: updateArrayEntry(current.cleanVehicleCredits, props.selectedVehicleCreditIndex, (entry) => ({ ...entry, msrpOrSalesPrice: value })) }))} value={activeVehicle.msrpOrSalesPrice} />
          <SlimFieldRow focused={props.focusIndex === 7} label="Tentative credit" onChange={(value) => props.updateCredits((current) => ({ ...current, cleanVehicleCredits: updateArrayEntry(current.cleanVehicleCredits, props.selectedVehicleCreditIndex, (entry) => ({ ...entry, tentativeCredit: value })) }))} value={activeVehicle.tentativeCredit} />
        </box>
      )}
    </box>
  );
}

function CreditOtherCreditsPanel(props: {
  readonly credits: InteractiveSupplementalFederalDraft["credits"];
  readonly focusIndex: number;
  readonly selectedOtherNonrefundableCreditIndex: number;
  readonly selectedOtherRefundableCreditIndex: number;
  readonly setSelectedOtherNonrefundableCreditIndex: (value: number) => void;
  readonly setSelectedOtherRefundableCreditIndex: (value: number) => void;
  readonly updateCredits: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => void;
}) {
  const activeNonref =
    props.credits.otherNonrefundableCredits[props.selectedOtherNonrefundableCreditIndex] ?? null;
  const activeRef =
    props.credits.otherRefundableCredits[props.selectedOtherRefundableCreditIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No other nonrefundable credits yet. Focus here and press `a`." focused={props.focusIndex === 1} items={props.credits.otherNonrefundableCredits} label="Other nonrefundable credits" optionDescription={(entry) => `${entry.amount || "0"}`} optionName={(entry, index) => `${index + 1}. ${entry.description.trim().length > 0 ? entry.description : "Untitled nonrefundable credit"}`} selectedIndex={props.selectedOtherNonrefundableCreditIndex} setSelectedIndex={props.setSelectedOtherNonrefundableCreditIndex} />
      {activeNonref == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Credit code" onChange={(value) => props.updateCredits((current) => ({ ...current, otherNonrefundableCredits: updateArrayEntry(current.otherNonrefundableCredits, props.selectedOtherNonrefundableCreditIndex, (entry) => ({ ...entry, code: value })) }))} value={activeNonref.code} />
          <SlimFieldRow focused={props.focusIndex === 3} label="Description" onChange={(value) => props.updateCredits((current) => ({ ...current, otherNonrefundableCredits: updateArrayEntry(current.otherNonrefundableCredits, props.selectedOtherNonrefundableCreditIndex, (entry) => ({ ...entry, description: value })) }))} value={activeNonref.description} />
          <SlimFieldRow focused={props.focusIndex === 4} label="Amount" onChange={(value) => props.updateCredits((current) => ({ ...current, otherNonrefundableCredits: updateArrayEntry(current.otherNonrefundableCredits, props.selectedOtherNonrefundableCreditIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeNonref.amount} />
          <SlimFieldRow focused={props.focusIndex === 5} label="Person ID" onChange={(value) => props.updateCredits((current) => ({ ...current, otherNonrefundableCredits: updateArrayEntry(current.otherNonrefundableCredits, props.selectedOtherNonrefundableCreditIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeNonref.personId} />
          <SlimFieldRow focused={props.focusIndex === 6} label="Source document ID" onChange={(value) => props.updateCredits((current) => ({ ...current, otherNonrefundableCredits: updateArrayEntry(current.otherNonrefundableCredits, props.selectedOtherNonrefundableCreditIndex, (entry) => ({ ...entry, sourceDocumentId: value })) }))} value={activeNonref.sourceDocumentId} />
        </box>
      )}
      <RosterSelect emptyMessage="No other refundable credits yet. Focus here and press `a`." focused={props.focusIndex === 7} items={props.credits.otherRefundableCredits} label="Other refundable credits" optionDescription={(entry) => `${entry.amount || "0"}`} optionName={(entry, index) => `${index + 1}. ${entry.description.trim().length > 0 ? entry.description : "Untitled refundable credit"}`} selectedIndex={props.selectedOtherRefundableCreditIndex} setSelectedIndex={props.setSelectedOtherRefundableCreditIndex} />
      {activeRef == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 8} label="Credit code" onChange={(value) => props.updateCredits((current) => ({ ...current, otherRefundableCredits: updateArrayEntry(current.otherRefundableCredits, props.selectedOtherRefundableCreditIndex, (entry) => ({ ...entry, code: value })) }))} value={activeRef.code} />
          <SlimFieldRow focused={props.focusIndex === 9} label="Description" onChange={(value) => props.updateCredits((current) => ({ ...current, otherRefundableCredits: updateArrayEntry(current.otherRefundableCredits, props.selectedOtherRefundableCreditIndex, (entry) => ({ ...entry, description: value })) }))} value={activeRef.description} />
          <SlimFieldRow focused={props.focusIndex === 10} label="Amount" onChange={(value) => props.updateCredits((current) => ({ ...current, otherRefundableCredits: updateArrayEntry(current.otherRefundableCredits, props.selectedOtherRefundableCreditIndex, (entry) => ({ ...entry, amount: value })) }))} value={activeRef.amount} />
          <SlimFieldRow focused={props.focusIndex === 11} label="Person ID" onChange={(value) => props.updateCredits((current) => ({ ...current, otherRefundableCredits: updateArrayEntry(current.otherRefundableCredits, props.selectedOtherRefundableCreditIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeRef.personId} />
          <SlimFieldRow focused={props.focusIndex === 12} label="Source document ID" onChange={(value) => props.updateCredits((current) => ({ ...current, otherRefundableCredits: updateArrayEntry(current.otherRefundableCredits, props.selectedOtherRefundableCreditIndex, (entry) => ({ ...entry, sourceDocumentId: value })) }))} value={activeRef.sourceDocumentId} />
        </box>
      )}
    </box>
  );
}

function CreditHsaPanel(props: {
  readonly credits: InteractiveSupplementalFederalDraft["credits"];
  readonly focusIndex: number;
  readonly selectedHsaCoverageIndex: number;
  readonly setSelectedHsaCoverageIndex: (value: number) => void;
  readonly updateCredits: (
    updater: (
      draft: InteractiveSupplementalFederalDraft["credits"],
    ) => InteractiveSupplementalFederalDraft["credits"],
  ) => void;
}) {
  const activeCoverage = props.credits.hsaCoverageMonths[props.selectedHsaCoverageIndex] ?? null;

  return (
    <box flexDirection="column" gap={1}>
      <RosterSelect emptyMessage="No HSA coverage months yet. Focus here and press `a`." focused={props.focusIndex === 1} items={props.credits.hsaCoverageMonths} label="HSA coverage months" optionDescription={(entry) => `${entry.personId} / ${entry.coverageType}`} optionName={(entry, index) => `${index + 1}. ${entry.month}`} selectedIndex={props.selectedHsaCoverageIndex} setSelectedIndex={props.setSelectedHsaCoverageIndex} />
      {activeCoverage == null ? null : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow focused={props.focusIndex === 2} label="Person ID" onChange={(value) => props.updateCredits((current) => ({ ...current, hsaCoverageMonths: updateArrayEntry(current.hsaCoverageMonths, props.selectedHsaCoverageIndex, (entry) => ({ ...entry, personId: value })) }))} value={activeCoverage.personId} />
          <SelectFieldRow focused={props.focusIndex === 3} label="Month" onChange={(value) => props.updateCredits((current) => ({ ...current, hsaCoverageMonths: updateArrayEntry(current.hsaCoverageMonths, props.selectedHsaCoverageIndex, (entry) => ({ ...entry, month: value })) }))} options={coverageMonthOptions} value={coverageMonthValues.includes(activeCoverage.month as (typeof coverageMonthValues)[number]) ? (activeCoverage.month as (typeof coverageMonthValues)[number]) : "january"} />
          <SelectFieldRow focused={props.focusIndex === 4} label="Coverage type" onChange={(value) => props.updateCredits((current) => ({ ...current, hsaCoverageMonths: updateArrayEntry(current.hsaCoverageMonths, props.selectedHsaCoverageIndex, (entry) => ({ ...entry, coverageType: value })) }))} options={hsaCoverageTypeOptions} value={hsaCoverageTypeValues.includes(activeCoverage.coverageType as (typeof hsaCoverageTypeValues)[number]) ? (activeCoverage.coverageType as (typeof hsaCoverageTypeValues)[number]) : "self_only"} />
        </box>
      )}
    </box>
  );
}

function W2Step(props: {
  readonly focusIndex: number;
  readonly incomeDraft: IncomeDraft | null;
  readonly selectedW2Index: number;
  readonly setIncomeDraft: StateSetter<IncomeDraft | null>;
  readonly setSelectedW2Index: (value: number) => void;
  readonly markDirty: () => void;
}) {
  if (props.incomeDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit W-2 details.</text>
      </box>
    );
  }

  const activeW2 = props.incomeDraft.w2s[props.selectedW2Index] ?? null;

  const updateW2 = <K extends keyof W2Draft>(key: K, value: W2Draft[K]) => {
    props.setIncomeDraft((current) => {
      if (current == null) {
        return current;
      }

      return {
        ...current,
        w2s: current.w2s.map((entry, index) =>
          index === props.selectedW2Index
            ? {
                ...entry,
                [key]: value,
              }
            : entry),
      };
    });
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>W-2 roster: focus the list, press `a` to add, `backspace` to remove.</text>
      <text>Boxes 1, 2, 3, and 5 are editable here. Save with `ctrl+s`.</text>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>W-2 entries</text>
        {props.incomeDraft.w2s.length === 0 ? (
          <text>No W-2 entries yet. Focus here and press `a`.</text>
        ) : (
          <select
            options={props.incomeDraft.w2s.map((entry, index) => ({
              name: `${index + 1}. ${entry.employerName.trim().length > 0 ? entry.employerName : "Untitled W-2"}`,
              description: `wages ${entry.wages || "0"} / fed ${entry.federalWithholding || "0"}`,
              value: entry.documentId,
            }))}
            height={Math.min(Math.max(props.incomeDraft.w2s.length, 2), 3)}
            selectedIndex={Math.min(props.selectedW2Index, props.incomeDraft.w2s.length - 1)}
            onChange={(index) => {
              props.setSelectedW2Index(index);
            }}
            focused={props.focusIndex === 0}
          />
        )}
      </box>

      {activeW2 == null ? (
        <box border padding={1}>
          <text>Add a W-2 draft to edit employer and wage details.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 1}
            label="Employer name"
            onChange={(value) => updateW2("employerName", value)}
            value={activeW2.employerName}
          />
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Employer EIN"
            onChange={(value) => updateW2("employerEin", value)}
            value={activeW2.employerEin}
          />
          <SlimFieldRow
            focused={props.focusIndex === 3}
            label="Box 1 wages"
            onChange={(value) => updateW2("wages", value)}
            value={activeW2.wages}
          />
          <SlimFieldRow
            focused={props.focusIndex === 4}
            label="Box 2 fed withholding"
            onChange={(value) => updateW2("federalWithholding", value)}
            value={activeW2.federalWithholding}
          />
          <SlimFieldRow
            focused={props.focusIndex === 5}
            label="Box 3 SS wages"
            onChange={(value) => updateW2("socialSecurityWages", value)}
            value={activeW2.socialSecurityWages}
          />
          <SlimFieldRow
            focused={props.focusIndex === 6}
            label="Box 4 SS tax withheld"
            onChange={(value) => updateW2("socialSecurityTaxWithheld", value)}
            value={activeW2.socialSecurityTaxWithheld}
          />
          <SlimFieldRow
            focused={props.focusIndex === 7}
            label="Box 5 medicare wages"
            onChange={(value) => updateW2("medicareWages", value)}
            value={activeW2.medicareWages}
          />
          <SlimFieldRow
            focused={props.focusIndex === 8}
            label="Box 6 medicare tax withheld"
            onChange={(value) => updateW2("medicareTaxWithheld", value)}
            value={activeW2.medicareTaxWithheld}
          />
          <SlimFieldRow
            focused={props.focusIndex === 9}
            label="Control number"
            onChange={(value) => updateW2("controlNumber", value)}
            value={activeW2.controlNumber ?? ""}
          />
          <BooleanSelectRow
            focused={props.focusIndex === 10}
            label="Retirement plan checkbox"
            onChange={(value) => updateW2("retirementPlan", value)}
            value={activeW2.retirementPlan ?? false}
          />
        </box>
      )}
    </box>
  );
}

function InterestStep(props: {
  readonly focusIndex: number;
  readonly incomeDraft: IncomeDraft | null;
  readonly selectedInterestIndex: number;
  readonly setIncomeDraft: StateSetter<IncomeDraft | null>;
  readonly setSelectedInterestIndex: (value: number) => void;
  readonly markDirty: () => void;
}) {
  if (props.incomeDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit 1099-INT details.</text>
      </box>
    );
  }

  const activeInterest = props.incomeDraft.interests[props.selectedInterestIndex] ?? null;

  const updateInterest = <K extends keyof InterestDraft>(key: K, value: InterestDraft[K]) => {
    props.setIncomeDraft((current) => {
      if (current == null) {
        return current;
      }

      return {
        ...current,
        interests: current.interests.map((entry, index) =>
          index === props.selectedInterestIndex
            ? {
                ...entry,
                [key]: value,
              }
            : entry),
      };
    });
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>1099-INT roster: focus the list, press `a` to add, `backspace` to remove.</text>
      <text>Boxes 1, 3, 4, and 8 are editable here. Save with `ctrl+s`.</text>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>1099-INT entries</text>
        {props.incomeDraft.interests.length === 0 ? (
          <text>No 1099-INT entries yet. Focus here and press `a`.</text>
        ) : (
          <select
            options={props.incomeDraft.interests.map((entry, index) => ({
              name: `${index + 1}. ${entry.payerName.trim().length > 0 ? entry.payerName : "Untitled 1099-INT"}`,
              description: `interest ${entry.interestIncome || "0"} / fed ${entry.federalWithholding || "0"}`,
              value: entry.documentId,
            }))}
            height={Math.min(Math.max(props.incomeDraft.interests.length, 2), 3)}
            selectedIndex={Math.min(
              props.selectedInterestIndex,
              props.incomeDraft.interests.length - 1,
            )}
            onChange={(index) => {
              props.setSelectedInterestIndex(index);
            }}
            focused={props.focusIndex === 0}
          />
        )}
      </box>

      {activeInterest == null ? (
        <box border padding={1}>
          <text>Add a 1099-INT draft to edit interest details.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 1}
            label="Payer name"
            onChange={(value) => updateInterest("payerName", value)}
            value={activeInterest.payerName}
          />
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Payer TIN"
            onChange={(value) => updateInterest("payerTin", value)}
            value={activeInterest.payerTin}
          />
          <SlimFieldRow
            focused={props.focusIndex === 3}
            label="Recipient account"
            onChange={(value) => updateInterest("recipientAccountNumber", value)}
            value={activeInterest.recipientAccountNumber ?? ""}
          />
          <SlimFieldRow
            focused={props.focusIndex === 4}
            label="Box 1 interest"
            onChange={(value) => updateInterest("interestIncome", value)}
            value={activeInterest.interestIncome}
          />
          <SlimFieldRow
            focused={props.focusIndex === 5}
            label="Box 4 fed withholding"
            onChange={(value) => updateInterest("federalWithholding", value)}
            value={activeInterest.federalWithholding}
          />
          <SlimFieldRow
            focused={props.focusIndex === 6}
            label="Box 8 tax-exempt interest"
            onChange={(value) => updateInterest("taxExemptInterest", value)}
            value={activeInterest.taxExemptInterest}
          />
          <SlimFieldRow
            focused={props.focusIndex === 7}
            label="Box 3 treasury interest"
            onChange={(value) => updateInterest("usSavingsBondsAndTreasuryInterest", value)}
            value={activeInterest.usSavingsBondsAndTreasuryInterest}
          />
          <SlimFieldRow
            focused={props.focusIndex === 8}
            label="Foreign tax paid"
            onChange={(value) => updateInterest("foreignTaxPaid", value)}
            value={activeInterest.foreignTaxPaid}
          />
        </box>
      )}
    </box>
  );
}

function DividendStep(props: {
  readonly focusIndex: number;
  readonly incomeDraft: IncomeDraft | null;
  readonly selectedDividendIndex: number;
  readonly setIncomeDraft: StateSetter<IncomeDraft | null>;
  readonly setSelectedDividendIndex: (value: number) => void;
  readonly markDirty: () => void;
}) {
  if (props.incomeDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit 1099-DIV details.</text>
      </box>
    );
  }

  const dividends = props.incomeDraft.dividends ?? [];
  const activeDividend = dividends[props.selectedDividendIndex] ?? null;

  const updateDividend = <K extends keyof DividendDraft>(
    key: K,
    value: DividendDraft[K],
  ) => {
    props.setIncomeDraft((current) => {
      if (current == null) {
        return current;
      }

      return {
        ...current,
        dividends: (current.dividends ?? []).map((entry, index) =>
          index === props.selectedDividendIndex
            ? {
                ...entry,
                [key]: value,
              }
            : entry,
        ),
      };
    });
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>1099-DIV roster: focus the list, press `a` to add, `backspace` to remove.</text>
      <text>Ordinary, qualified, capital gain, withholding, and exempt-interest boxes are editable.</text>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>1099-DIV entries</text>
        {dividends.length === 0 ? (
          <text>No 1099-DIV entries yet. Focus here and press `a`.</text>
        ) : (
          <select
            options={dividends.map((entry, index) => ({
              name: `${index + 1}. ${entry.payerName.trim().length > 0 ? entry.payerName : "Untitled 1099-DIV"}`,
              description: `ordinary ${entry.ordinaryDividends || "0"} / fed ${entry.federalWithholding || "0"}`,
              value: entry.documentId,
            }))}
            height={Math.min(Math.max(dividends.length, 2), 3)}
            selectedIndex={Math.min(props.selectedDividendIndex, dividends.length - 1)}
            onChange={(index) => {
              props.setSelectedDividendIndex(index);
            }}
            focused={props.focusIndex === 0}
          />
        )}
      </box>

      {activeDividend == null ? (
        <box border padding={1}>
          <text>Add a 1099-DIV draft to edit dividend details.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 1}
            label="Payer name"
            onChange={(value) => updateDividend("payerName", value)}
            value={activeDividend.payerName}
          />
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Payer TIN"
            onChange={(value) => updateDividend("payerTin", value)}
            value={activeDividend.payerTin}
          />
          <SlimFieldRow
            focused={props.focusIndex === 3}
            label="Recipient account"
            onChange={(value) => updateDividend("recipientAccountNumber", value)}
            value={activeDividend.recipientAccountNumber ?? ""}
          />
          <SlimFieldRow
            focused={props.focusIndex === 4}
            label="Box 1a ordinary dividends"
            onChange={(value) => updateDividend("ordinaryDividends", value)}
            value={activeDividend.ordinaryDividends}
          />
          <SlimFieldRow
            focused={props.focusIndex === 5}
            label="Box 1b qualified dividends"
            onChange={(value) => updateDividend("qualifiedDividends", value)}
            value={activeDividend.qualifiedDividends}
          />
          <SlimFieldRow
            focused={props.focusIndex === 6}
            label="Box 2a capital gain distributions"
            onChange={(value) => updateDividend("capitalGainDistributions", value)}
            value={activeDividend.capitalGainDistributions}
          />
          <SlimFieldRow
            focused={props.focusIndex === 7}
            label="Box 4 fed withholding"
            onChange={(value) => updateDividend("federalWithholding", value)}
            value={activeDividend.federalWithholding}
          />
          <SlimFieldRow
            focused={props.focusIndex === 8}
            label="Box 12 exempt-interest dividends"
            onChange={(value) => updateDividend("exemptInterestDividends", value)}
            value={activeDividend.exemptInterestDividends}
          />
          <SlimFieldRow
            focused={props.focusIndex === 9}
            label="Foreign tax paid"
            onChange={(value) => updateDividend("foreignTaxPaid", value)}
            value={activeDividend.foreignTaxPaid}
          />
        </box>
      )}
    </box>
  );
}

function RetirementStep(props: {
  readonly focusIndex: number;
  readonly incomeDraft: IncomeDraft | null;
  readonly selectedRetirementIndex: number;
  readonly setIncomeDraft: StateSetter<IncomeDraft | null>;
  readonly setSelectedRetirementIndex: (value: number) => void;
  readonly markDirty: () => void;
}) {
  if (props.incomeDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit 1099-R details.</text>
      </box>
    );
  }

  const retirements = props.incomeDraft.retirements ?? [];
  const activeRetirement = retirements[props.selectedRetirementIndex] ?? null;

  const updateRetirement = <K extends keyof RetirementDraft>(
    key: K,
    value: RetirementDraft[K],
  ) => {
    props.setIncomeDraft((current) => {
      if (current == null) {
        return current;
      }

      return {
        ...current,
        retirements: (current.retirements ?? []).map((entry, index) =>
          index === props.selectedRetirementIndex
            ? {
                ...entry,
                [key]: value,
              }
            : entry,
        ),
      };
    });
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>1099-R roster: focus the list, press `a` to add, `backspace` to remove.</text>
      <text>Gross, taxable, withholding, distribution codes, and IRA flags are editable.</text>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>1099-R entries</text>
        {retirements.length === 0 ? (
          <text>No 1099-R entries yet. Focus here and press `a`.</text>
        ) : (
          <select
            options={retirements.map((entry, index) => ({
              name: `${index + 1}. ${entry.payerName.trim().length > 0 ? entry.payerName : "Untitled 1099-R"}`,
              description: `gross ${entry.grossDistribution || "0"} / taxable ${entry.taxableAmount || "0"}`,
              value: entry.documentId,
            }))}
            height={Math.min(Math.max(retirements.length, 2), 3)}
            selectedIndex={Math.min(props.selectedRetirementIndex, retirements.length - 1)}
            onChange={(index) => {
              props.setSelectedRetirementIndex(index);
            }}
            focused={props.focusIndex === 0}
          />
        )}
      </box>

      {activeRetirement == null ? (
        <box border padding={1}>
          <text>Add a 1099-R draft to edit retirement distribution details.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 1}
            label="Payer name"
            onChange={(value) => updateRetirement("payerName", value)}
            value={activeRetirement.payerName}
          />
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Payer TIN"
            onChange={(value) => updateRetirement("payerTin", value)}
            value={activeRetirement.payerTin}
          />
          <SlimFieldRow
            focused={props.focusIndex === 3}
            label="Recipient account"
            onChange={(value) => updateRetirement("recipientAccountNumber", value)}
            value={activeRetirement.recipientAccountNumber ?? ""}
          />
          <SlimFieldRow
            focused={props.focusIndex === 4}
            label="Box 1 gross distribution"
            onChange={(value) => updateRetirement("grossDistribution", value)}
            value={activeRetirement.grossDistribution}
          />
          <SlimFieldRow
            focused={props.focusIndex === 5}
            label="Box 2a taxable amount"
            onChange={(value) => updateRetirement("taxableAmount", value)}
            value={activeRetirement.taxableAmount}
          />
          <SlimFieldRow
            focused={props.focusIndex === 6}
            label="Box 4 fed withholding"
            onChange={(value) => updateRetirement("federalWithholding", value)}
            value={activeRetirement.federalWithholding}
          />
          <SlimFieldRow
            focused={props.focusIndex === 7}
            label="Box 7 code 1"
            onChange={(value) => updateRetirement("distributionCode1", value)}
            value={activeRetirement.distributionCode1}
          />
          <SlimFieldRow
            focused={props.focusIndex === 8}
            label="Box 7 code 2"
            onChange={(value) => updateRetirement("distributionCode2", value)}
            value={activeRetirement.distributionCode2}
          />
          <BooleanSelectRow
            focused={props.focusIndex === 9}
            label="Taxable amount not determined"
            onChange={(value) => updateRetirement("taxableAmountNotDetermined", value)}
            value={activeRetirement.taxableAmountNotDetermined}
          />
          <BooleanSelectRow
            focused={props.focusIndex === 10}
            label="Total distribution"
            onChange={(value) => updateRetirement("totalDistribution", value)}
            value={activeRetirement.totalDistribution}
          />
          <BooleanSelectRow
            focused={props.focusIndex === 11}
            label="IRA / SEP / SIMPLE"
            onChange={(value) => updateRetirement("iraSepSimple", value)}
            value={activeRetirement.iraSepSimple}
          />
        </box>
      )}
    </box>
  );
}

function PaymentsStep(props: {
  readonly focusIndex: number;
  readonly paymentsDraft: PaymentsDraft | null;
  readonly selectedEstimatedPaymentIndex: number;
  readonly selectedExtensionPaymentIndex: number;
  readonly setPaymentsDraft: StateSetter<PaymentsDraft | null>;
  readonly setSelectedEstimatedPaymentIndex: (value: number) => void;
  readonly setSelectedExtensionPaymentIndex: (value: number) => void;
  readonly markDirty: () => void;
}) {
  if (props.paymentsDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit payment details.</text>
      </box>
    );
  }

  const activeEstimated =
    props.paymentsDraft.estimatedPayments[props.selectedEstimatedPaymentIndex] ?? null;
  const activeExtension =
    props.paymentsDraft.extensionPayments[props.selectedExtensionPaymentIndex] ?? null;

  const updateEstimated = <K extends keyof ReturnType<typeof createEmptyEstimatedPaymentDraft>>(
    key: K,
    value: ReturnType<typeof createEmptyEstimatedPaymentDraft>[K],
  ) => {
    props.setPaymentsDraft((current) => {
      if (current == null) {
        return current;
      }

      return {
        ...current,
        estimatedPayments: current.estimatedPayments.map((entry, index) =>
          index === props.selectedEstimatedPaymentIndex
            ? {
                ...entry,
                [key]: value,
              }
            : entry,
        ),
      };
    });
    props.markDirty();
  };

  const updateExtension = <K extends keyof ReturnType<typeof createEmptyExtensionPaymentDraft>>(
    key: K,
    value: ReturnType<typeof createEmptyExtensionPaymentDraft>[K],
  ) => {
    props.setPaymentsDraft((current) => {
      if (current == null) {
        return current;
      }

      return {
        ...current,
        extensionPayments: current.extensionPayments.map((entry, index) =>
          index === props.selectedExtensionPaymentIndex
            ? {
                ...entry,
                [key]: value,
              }
            : entry,
        ),
      };
    });
    props.markDirty();
  };

  const updateDraft = <K extends keyof PaymentsDraft>(
    key: K,
    value: PaymentsDraft[K],
  ) => {
    props.setPaymentsDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            [key]: value,
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>Use `a` to add estimated or extension payments while each list is focused.</text>
      <text>Federal-only payments here feed the same canonical facts used by `run` and `export`.</text>

      <box border padding={1} flexDirection="column" gap={1}>
        <text>Estimated payments</text>
        {props.paymentsDraft.estimatedPayments.length === 0 ? (
          <text>No estimated payments yet. Focus here and press `a`.</text>
        ) : (
          <select
            options={props.paymentsDraft.estimatedPayments.map((entry, index) => ({
              name: `${index + 1}. ${entry.quarter}`,
              description: `${entry.amount || "0"} paid ${entry.paidDate || "(date pending)"}`,
              value: entry.paymentId,
            }))}
            height={Math.min(Math.max(props.paymentsDraft.estimatedPayments.length, 2), 3)}
            selectedIndex={Math.min(
              props.selectedEstimatedPaymentIndex,
              props.paymentsDraft.estimatedPayments.length - 1,
            )}
            onChange={(index) => {
              props.setSelectedEstimatedPaymentIndex(index);
            }}
            focused={props.focusIndex === 0}
          />
        )}
      </box>

      {activeEstimated == null ? (
        <box border padding={1}>
          <text>Add an estimated payment to edit amount, date, and quarter.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 1}
            label="Estimated payment amount"
            onChange={(value) => updateEstimated("amount", value)}
            value={activeEstimated.amount}
          />
          <SlimFieldRow
            focused={props.focusIndex === 2}
            label="Paid date"
            onChange={(value) => updateEstimated("paidDate", value)}
            value={activeEstimated.paidDate}
          />
          <SelectFieldRow
            focused={props.focusIndex === 3}
            label="Quarter"
            onChange={(value) => updateEstimated("quarter", value)}
            options={estimatedQuarterOptions}
            value={activeEstimated.quarter}
          />
        </box>
      )}

      <box border padding={1} flexDirection="column" gap={1}>
        <text>Extension payments</text>
        {props.paymentsDraft.extensionPayments.length === 0 ? (
          <text>No extension payments yet. Focus here and press `a`.</text>
        ) : (
          <select
            options={props.paymentsDraft.extensionPayments.map((entry, index) => ({
              name: `${index + 1}. ${entry.formType}`,
              description: `${entry.amount || "0"} paid ${entry.paidDate || "(date pending)"}`,
              value: entry.extensionPaymentId,
            }))}
            height={Math.min(Math.max(props.paymentsDraft.extensionPayments.length, 2), 3)}
            selectedIndex={Math.min(
              props.selectedExtensionPaymentIndex,
              props.paymentsDraft.extensionPayments.length - 1,
            )}
            onChange={(index) => {
              props.setSelectedExtensionPaymentIndex(index);
            }}
            focused={props.focusIndex === 4}
          />
        )}
      </box>

      {activeExtension == null ? (
        <box border padding={1}>
          <text>Add an extension payment to edit amount, date, and form type.</text>
        </box>
      ) : (
        <box flexDirection="column" gap={1}>
          <SlimFieldRow
            focused={props.focusIndex === 5}
            label="Extension payment amount"
            onChange={(value) => updateExtension("amount", value)}
            value={activeExtension.amount}
          />
          <SlimFieldRow
            focused={props.focusIndex === 6}
            label="Paid date"
            onChange={(value) => updateExtension("paidDate", value)}
            value={activeExtension.paidDate}
          />
          <SelectFieldRow
            focused={props.focusIndex === 7}
            label="Extension form type"
            onChange={(value) => updateExtension("formType", value)}
            options={extensionFormTypeOptions}
            value={activeExtension.formType}
          />
        </box>
      )}

      <SlimFieldRow
        focused={props.focusIndex === 8}
        label="Prior-year overpayment applied to 2025"
        onChange={(value) => updateDraft("priorYearOverpaymentAppliedTo2025", value)}
        value={props.paymentsDraft.priorYearOverpaymentAppliedTo2025}
      />
    </box>
  );
}

function BankingStep(props: {
  readonly focusIndex: number;
  readonly paymentsDraft: PaymentsDraft | null;
  readonly setPaymentsDraft: StateSetter<PaymentsDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.paymentsDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit refund and debit banking instructions.</text>
      </box>
    );
  }

  const updateDraft = <K extends keyof PaymentsDraft>(
    key: K,
    value: PaymentsDraft[K],
  ) => {
    props.setPaymentsDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            [key]: value,
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>Banking instructions are optional, but they are part of the eventual filing package.</text>

      <BooleanSelectRow
        focused={props.focusIndex === 0}
        label="Enable refund direct deposit"
        onChange={(value) => updateDraft("refundDirectDepositEnabled", value)}
        value={props.paymentsDraft.refundDirectDepositEnabled}
      />
      <SlimFieldRow
        focused={props.focusIndex === 1}
        label="Refund bank name"
        onChange={(value) => updateDraft("refundBankName", value)}
        value={props.paymentsDraft.refundBankName}
      />
      <SelectFieldRow
        focused={props.focusIndex === 2}
        label="Refund account type"
        onChange={(value) => updateDraft("refundAccountType", value)}
        options={bankAccountTypeOptions}
        value={props.paymentsDraft.refundAccountType}
      />
      <SlimFieldRow
        focused={props.focusIndex === 3}
        label="Refund last 4 account number"
        onChange={(value) => updateDraft("refundLast4AccountNumber", value)}
        value={props.paymentsDraft.refundLast4AccountNumber}
      />
      <SlimFieldRow
        focused={props.focusIndex === 4}
        label="Refund last 4 routing number"
        onChange={(value) => updateDraft("refundLast4RoutingNumber", value)}
        value={props.paymentsDraft.refundLast4RoutingNumber}
      />
      <SlimFieldRow
        focused={props.focusIndex === 5}
        label="Refund vault token"
        onChange={(value) => updateDraft("refundVaultToken", value)}
        value={props.paymentsDraft.refundVaultToken}
      />

      <BooleanSelectRow
        focused={props.focusIndex === 6}
        label="Enable balance-due direct debit"
        onChange={(value) => updateDraft("balanceDueDirectDebitEnabled", value)}
        value={props.paymentsDraft.balanceDueDirectDebitEnabled}
      />
      <SlimFieldRow
        focused={props.focusIndex === 7}
        label="Debit bank name"
        onChange={(value) => updateDraft("debitBankName", value)}
        value={props.paymentsDraft.debitBankName}
      />
      <SelectFieldRow
        focused={props.focusIndex === 8}
        label="Debit account type"
        onChange={(value) => updateDraft("debitAccountType", value)}
        options={bankAccountTypeOptions}
        value={props.paymentsDraft.debitAccountType}
      />
      <SlimFieldRow
        focused={props.focusIndex === 9}
        label="Debit last 4 account number"
        onChange={(value) => updateDraft("debitLast4AccountNumber", value)}
        value={props.paymentsDraft.debitLast4AccountNumber}
      />
      <SlimFieldRow
        focused={props.focusIndex === 10}
        label="Debit last 4 routing number"
        onChange={(value) => updateDraft("debitLast4RoutingNumber", value)}
        value={props.paymentsDraft.debitLast4RoutingNumber}
      />
      <SlimFieldRow
        focused={props.focusIndex === 11}
        label="Debit vault token"
        onChange={(value) => updateDraft("debitVaultToken", value)}
        value={props.paymentsDraft.debitVaultToken}
      />
      <SlimFieldRow
        focused={props.focusIndex === 12}
        label="Requested debit date"
        onChange={(value) => updateDraft("debitRequestedDate", value)}
        value={props.paymentsDraft.debitRequestedDate}
      />
    </box>
  );
}

function EfileStep(props: {
  readonly efileDraft: EfileDraft | null;
  readonly focusIndex: number;
  readonly setEfileDraft: StateSetter<EfileDraft | null>;
  readonly markDirty: () => void;
}) {
  if (props.efileDraft == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session to edit e-file authorization details.</text>
      </box>
    );
  }

  const updateDraft = <K extends keyof EfileDraft>(
    key: K,
    value: EfileDraft[K],
  ) => {
    props.setEfileDraft((current) =>
      current == null
        ? current
        : {
            ...current,
            [key]: value,
          },
    );
    props.markDirty();
  };

  return (
    <box flexDirection="column" gap={1}>
      <text>E-file settings drive signer metadata for the taxpayer submission package.</text>

      <SelectFieldRow
        focused={props.focusIndex === 0}
        label="Signature method"
        onChange={(value) => updateDraft("signatureMethod", value)}
        options={signatureMethodOptions}
        value={props.efileDraft.signatureMethod}
      />
      <SlimFieldRow
        focused={props.focusIndex === 1}
        label="Taxpayer PIN token"
        onChange={(value) => updateDraft("taxpayerPinToken", value)}
        value={props.efileDraft.taxpayerPinToken}
      />
      <SlimFieldRow
        focused={props.focusIndex === 2}
        label="Prior-year AGI"
        onChange={(value) => updateDraft("taxpayerPriorYearAgi", value)}
        value={props.efileDraft.taxpayerPriorYearAgi}
      />
      <SlimFieldRow
        focused={props.focusIndex === 3}
        label="Prior-year PIN token"
        onChange={(value) => updateDraft("taxpayerPriorYearPinToken", value)}
        value={props.efileDraft.taxpayerPriorYearPinToken}
      />
      <SlimFieldRow
        focused={props.focusIndex === 4}
        label="Signed at timestamp"
        onChange={(value) => updateDraft("taxpayerSignedAt", value)}
        value={props.efileDraft.taxpayerSignedAt}
      />
    </box>
  );
}

function FieldRow(props: {
  readonly focused: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <box border padding={1} flexDirection="column" gap={1}>
      <text>{props.label}</text>
      <input
        value={props.value}
        onChange={props.onChange}
        focused={props.focused}
        width="100%"
      />
    </box>
  );
}

function SlimFieldRow(props: {
  readonly focused: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <box flexDirection="column">
      <text>{props.label}</text>
      <input
        value={props.value}
        onChange={props.onChange}
        focused={props.focused}
        width="100%"
      />
    </box>
  );
}

function SelectFieldRow<T extends string>(props: {
  readonly focused: boolean;
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: ReadonlyArray<SelectChoice<T>>;
  readonly value: T;
}) {
  const selectedIndex = Math.max(
    props.options.findIndex((option) => option.value === props.value),
    0,
  );

  return (
    <box border padding={1} flexDirection="column" gap={1}>
      <text>{props.label}</text>
      <select
        options={props.options.slice()}
        height={Math.min(Math.max(props.options.length, 2), 4)}
        selectedIndex={selectedIndex}
        onChange={(_, option) => {
          if (option != null) {
            props.onChange(option.value);
          }
        }}
        focused={props.focused}
      />
    </box>
  );
}

function BooleanSelectRow(props: {
  readonly focused: boolean;
  readonly label: string;
  readonly onChange: (value: boolean) => void;
  readonly value: boolean;
}) {
  return (
    <SelectFieldRow
      focused={props.focused}
      label={props.label}
      onChange={(value) => {
        props.onChange(value === "enabled");
      }}
      options={booleanOptions}
      value={props.value ? "enabled" : "disabled"}
    />
  );
}

function ResultsStep(props: {
  readonly resultState: ResultState;
  readonly session: InteractiveSession | null;
}) {
  if (props.session == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session first.</text>
      </box>
    );
  }

  switch (props.resultState.status) {
    case "idle":
      return (
        <box border padding={1}>
          <text>Press `ctrl+r` to run the tax calculation.</text>
        </box>
      );
    case "running":
      return (
        <box border padding={1}>
          <text>Running the tax pipeline...</text>
        </box>
      );
    case "error":
      return (
        <box border padding={1}>
          <text>{props.resultState.message}</text>
        </box>
      );
    case "ready": {
      const summary = props.resultState.payload.core_engine.federal_summary;
      const stateSummaries = props.resultState.payload.core_engine.state_summaries;

      return (
        <box flexDirection="column" gap={1}>
          <box border padding={1} flexDirection="column">
            <text>Adjusted gross income: {summary.line11_adjusted_gross_income}</text>
            <text>Taxable income: {summary.line15_taxable_income}</text>
            <text>Total tax: {summary.line24_total_tax}</text>
            <text>Total payments: {summary.line33_total_payments}</text>
            <text>Refund amount: {summary.line34_refund_amount}</text>
            <text>Amount owed: {summary.line37_amount_owed}</text>
          </box>

          <box border padding={1} flexDirection="column">
            <text>Activated modules</text>
            {props.resultState.payload.core_engine.activated_module_ids.map((moduleId) => (
              <text key={moduleId}>- {moduleId}</text>
            ))}
          </box>

          <box border padding={1} flexDirection="column">
            <text>State summaries</text>
            {stateSummaries.length === 0 ? (
              <text>No state summaries produced.</text>
            ) : (
              stateSummaries.map((stateSummary) => (
                <text key={stateSummary.state_code}>
                  {stateSummary.state_code} {stateSummary.return_kind ?? "unknown"}: start{" "}
                  {stateSummary.adjusted_gross_income_or_starting_point} / taxable{" "}
                  {stateSummary.taxable_income ?? "n/a"} / tax {stateSummary.total_tax} / payments{" "}
                  {stateSummary.total_payments} / refund {stateSummary.refund_amount} / owed{" "}
                  {stateSummary.amount_owed}
                </text>
              ))
            )}
          </box>
        </box>
      );
    }
    default:
      return <text>Unknown result state.</text>;
  }
}

function ExportStep(props: {
  readonly exportOutputDir: string;
  readonly exportPresetId: ExportPresetId;
  readonly exportState: ExportState;
  readonly focusIndex: number;
  readonly setExportOutputDir: (value: string) => void;
  readonly setExportPresetId: (value: ExportPresetId) => void;
  readonly session: InteractiveSession | null;
}) {
  if (props.session == null) {
    return (
      <box border padding={1}>
        <text>Create or open a session first.</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={1}>
      <text>Press `ctrl+e` to export the current session.</text>

      <FieldRow
        focused={props.focusIndex === 0}
        label="Output directory"
        onChange={props.setExportOutputDir}
        value={props.exportOutputDir}
      />

      <box border padding={1} flexDirection="column" gap={1}>
        <text>Export preset</text>
        <select
          options={exportPresetOptions.map((preset) => ({
            name: preset.label,
            description: preset.formats.join(", "),
            value: preset.id,
          }))}
          height={4}
          selectedIndex={exportPresetOptions.findIndex((preset) => preset.id === props.exportPresetId)}
          onChange={(_, option) => {
            if (typeof option?.value === "string") {
              props.setExportPresetId(option.value as ExportPresetId);
            }
          }}
          focused={props.focusIndex === 1}
        />
      </box>

      {renderExportState(props.exportState)}
    </box>
  );
}

function renderExportState(exportState: ExportState) {
  switch (exportState.status) {
    case "idle":
      return (
        <box border padding={1}>
          <text>No export has been run in this session yet.</text>
        </box>
      );
    case "running":
      return (
        <box border padding={1}>
          <text>Writing artifacts...</text>
        </box>
      );
    case "error":
      return (
        <box border padding={1}>
          <text>{exportState.message}</text>
        </box>
      );
    case "ready":
      return (
        <box border padding={1} flexDirection="column">
          <text>Output: {truncateMiddle(exportState.payload.outputDir, 56)}</text>
          <text>Manifest: {truncateMiddle(exportState.payload.manifestPath, 56)}</text>
          {exportState.payload.artifacts.map((artifact) => (
            <text key={artifact.path}>- {artifact.fileName}</text>
          ))}
        </box>
      );
    default:
      return <text>Unknown export state.</text>;
  }
}

const familyPanelOptions: ReadonlyArray<
  SelectChoice<"taxpayer" | "spouse" | "dependents">
> = [
  {
    name: "Taxpayer",
    description: "Taxpayer supplemental identity and eligibility fields.",
    value: "taxpayer",
  },
  {
    name: "Spouse",
    description: "Spouse identity and status fields.",
    value: "spouse",
  },
  {
    name: "Dependents",
    description: "Dependent roster and credit eligibility fields.",
    value: "dependents",
  },
];

const documentPanelOptions: ReadonlyArray<
  SelectChoice<
    "1099_b" | "1099_g" | "ssa_1099" | "1098" | "1098_e" | "1098_t" | "1095_a"
  >
> = [
  { name: "1099-B", description: "Broker sales and Form 8949 transactions.", value: "1099_b" },
  { name: "1099-G", description: "Unemployment compensation.", value: "1099_g" },
  { name: "SSA-1099", description: "Social Security benefits.", value: "ssa_1099" },
  { name: "1098", description: "Mortgage interest and taxes.", value: "1098" },
  { name: "1098-E", description: "Student loan interest.", value: "1098_e" },
  { name: "1098-T", description: "Education credit inputs.", value: "1098_t" },
  { name: "1095-A", description: "Marketplace policy and monthly premiums.", value: "1095_a" },
];

const supplementalIncomePanelOptions: ReadonlyArray<
  SelectChoice<
    "1099_nec" | "1099_misc" | "schedule_c" | "schedule_e" | "other_income" | "withholdings"
  >
> = [
  { name: "1099-NEC", description: "Nonemployee compensation.", value: "1099_nec" },
  { name: "1099-MISC", description: "Miscellaneous income categories.", value: "1099_misc" },
  { name: "Schedule C", description: "Self-employment businesses.", value: "schedule_c" },
  { name: "Schedule E", description: "Rental or pass-through activities.", value: "schedule_e" },
  { name: "Other Income", description: "Schedule 1 income not tied to a form.", value: "other_income" },
  { name: "Withholdings", description: "Manual federal withholding rows.", value: "withholdings" },
];

const deductionsPanelOptions: ReadonlyArray<SelectChoice<"adjustments" | "itemized">> = [
  { name: "Adjustments", description: "Schedule 1 adjustments.", value: "adjustments" },
  { name: "Itemized", description: "Schedule A itemized deductions.", value: "itemized" },
];

const creditsPanelOptions: ReadonlyArray<
  SelectChoice<
    | "candidates"
    | "care_providers"
    | "care_expenses"
    | "energy"
    | "vehicles"
    | "other_credits"
    | "hsa"
  >
> = [
  { name: "Candidates", description: "Credit candidate person IDs.", value: "candidates" },
  { name: "Care Providers", description: "Dependent care provider roster.", value: "care_providers" },
  { name: "Care Expenses", description: "Dependent care expense roster.", value: "care_expenses" },
  { name: "Energy", description: "Residential clean energy projects.", value: "energy" },
  { name: "Vehicles", description: "Clean vehicle credit claims.", value: "vehicles" },
  { name: "Other Credits", description: "Other refundable and nonrefundable credits.", value: "other_credits" },
  { name: "HSA", description: "HSA coverage months.", value: "hsa" },
];

const deductionStrategyPreferenceOptions: ReadonlyArray<
  SelectChoice<"auto" | "standard" | "itemized">
> = [
  { name: "Auto", description: "Let the engine choose.", value: "auto" },
  { name: "Standard", description: "Force the standard deduction.", value: "standard" },
  { name: "Itemized", description: "Force itemized deductions.", value: "itemized" },
];

const electionSelectionBasisValues = [
  "user_selected",
  "engine_optimized",
  "required_by_rule",
  "partner_required",
  "defaulted",
] as const;

const electionSelectionBasisOptions: ReadonlyArray<
  SelectChoice<(typeof electionSelectionBasisValues)[number]>
> = electionSelectionBasisValues.map((value) => ({
  name: value.replaceAll("_", " "),
  description: `Election basis: ${value.replaceAll("_", " ")}.`,
  value,
}));

const basisReportedOptions: ReadonlyArray<
  SelectChoice<"unset" | "reported" | "not_reported">
> = [
  { name: "Unset", description: "Leave basis-reported status blank.", value: "unset" },
  { name: "Reported", description: "Basis was reported to the IRS.", value: "reported" },
  { name: "Not Reported", description: "Basis was not reported to the IRS.", value: "not_reported" },
];

const capitalTransactionTermValues = ["short", "long"] as const;
const capitalTransactionTermOptions: ReadonlyArray<
  SelectChoice<(typeof capitalTransactionTermValues)[number]>
> = [
  { name: "Short", description: "Short-term transaction.", value: "short" },
  { name: "Long", description: "Long-term transaction.", value: "long" },
];

const form8949BoxValues = ["A", "B", "C", "D", "E", "F"] as const;
const form8949BoxOptions: ReadonlyArray<SelectChoice<(typeof form8949BoxValues)[number]>> =
  form8949BoxValues.map((value) => ({
    name: value,
    description: `Form 8949 box ${value}.`,
    value,
  }));

const securedDebtOptions: ReadonlyArray<
  SelectChoice<"unset" | "secured" | "not_secured">
> = [
  { name: "Unset", description: "Leave this fact blank.", value: "unset" },
  { name: "Secured", description: "Debt was secured by the home.", value: "secured" },
  { name: "Not Secured", description: "Debt was not used for the home.", value: "not_secured" },
];

const marketplaceMonthValues = [
  "annual",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const marketplaceMonthOptions: ReadonlyArray<
  SelectChoice<(typeof marketplaceMonthValues)[number]>
> = marketplaceMonthValues.map((value) => ({
  name: value,
  description: `1095-A row for ${value}.`,
  value,
}));

const accountingMethodValues = ["cash", "accrual", "other"] as const;
const accountingMethodOptions: ReadonlyArray<
  SelectChoice<(typeof accountingMethodValues)[number]>
> = accountingMethodValues.map((value) => ({
  name: value,
  description: `Accounting method: ${value}.`,
  value,
}));

const vehicleExpenseMethodValues = ["standard_mileage", "actual", "other"] as const;
const vehicleExpenseMethodOptions: ReadonlyArray<
  SelectChoice<(typeof vehicleExpenseMethodValues)[number]>
> = vehicleExpenseMethodValues.map((value) => ({
  name: value.replaceAll("_", " "),
  description: `Vehicle expense method: ${value.replaceAll("_", " ")}.`,
  value,
}));

const participationOptions: ReadonlyArray<SelectChoice<"unset" | "yes" | "no">> = [
  { name: "Unset", description: "Leave participation unspecified.", value: "unset" },
  { name: "Yes", description: "Materially participates.", value: "yes" },
  { name: "No", description: "Does not materially participate.", value: "no" },
];

const coverageMonthValues = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const coverageMonthOptions: ReadonlyArray<
  SelectChoice<(typeof coverageMonthValues)[number]>
> = coverageMonthValues.map((value) => ({
  name: value,
  description: `Coverage month: ${value}.`,
  value,
}));

const hsaCoverageTypeValues = ["self_only", "family", "none"] as const;
const hsaCoverageTypeOptions: ReadonlyArray<
  SelectChoice<(typeof hsaCoverageTypeValues)[number]>
> = hsaCoverageTypeValues.map((value) => ({
  name: value.replaceAll("_", " "),
  description: `HSA coverage: ${value.replaceAll("_", " ")}.`,
  value,
}));

function titleForStep(stepId: StepId): string {
  switch (stepId) {
    case "session":
      return "Session";
    case "household":
      return "Household";
    case "family":
      return "Family";
    case "documents":
      return "Other Docs";
    case "supplemental_income":
      return "Extra Income";
    case "deductions":
      return "Deductions";
    case "credits":
      return "Credits";
    case "overrides":
      return "Overrides";
    case "w2":
      return "W-2";
    case "interest":
      return "1099-INT";
    case "dividend":
      return "1099-DIV";
    case "retirement":
      return "1099-R";
    case "payments":
      return "Payments";
    case "banking":
      return "Banking";
    case "efile":
      return "E-file";
    case "results":
      return "Results";
    case "export":
      return "Export";
    default:
      return "TaxZilla";
  }
}

function nextFocusIndex(current: number, maxIndex: number): number {
  if (maxIndex === 0) {
    return 0;
  }

  return (current + 1) % maxIndex;
}

function previousFocusIndex(current: number, maxIndex: number): number {
  if (maxIndex === 0) {
    return 0;
  }

  return (current - 1 + maxIndex) % maxIndex;
}

function resolveMaxFocusIndex(options: {
  readonly activeStep: StepId;
  readonly creditsPanel:
    | "candidates"
    | "care_providers"
    | "care_expenses"
    | "energy"
    | "vehicles"
    | "other_credits"
    | "hsa";
  readonly deductionsPanel: "adjustments" | "itemized";
  readonly documentsPanel:
    | "1099_b"
    | "1099_g"
    | "ssa_1099"
    | "1098"
    | "1098_e"
    | "1098_t"
    | "1095_a";
  readonly efileDraft: EfileDraft | null;
  readonly familyPanel: "taxpayer" | "spouse" | "dependents";
  readonly incomeDraft: IncomeDraft | null;
  readonly paymentsDraft: PaymentsDraft | null;
  readonly selected1095AIndex: number;
  readonly selected1099BIndex: number;
  readonly supplementalFederalDraft: InteractiveSupplementalFederalDraft | null;
  readonly supplementalIncomePanel:
    | "1099_nec"
    | "1099_misc"
    | "schedule_c"
    | "schedule_e"
    | "other_income"
    | "withholdings";
}): number {
  switch (options.activeStep) {
    case "session":
      return 3;
    case "household":
      return 6;
    case "family": {
      if (options.supplementalFederalDraft == null) {
        return 0;
      }

      if (options.familyPanel === "taxpayer") {
        return 9;
      }

      if (options.familyPanel === "spouse") {
        return options.supplementalFederalDraft.family.includeSpouse ? 13 : 2;
      }

      return options.supplementalFederalDraft.family.dependents.length > 0 ? 17 : 2;
    }
    case "documents": {
      if (options.supplementalFederalDraft == null) {
        return 0;
      }

      switch (options.documentsPanel) {
        case "1099_b": {
          const activeForm =
            options.supplementalFederalDraft.documents.brokerageForms[
              options.selected1099BIndex
            ] ?? null;
          if (options.supplementalFederalDraft.documents.brokerageForms.length === 0) {
            return 2;
          }
          return activeForm != null && activeForm.transactions.length > 0 ? 20 : 7;
        }
        case "1099_g":
          return options.supplementalFederalDraft.documents.unemploymentForms.length > 0
            ? 8
            : 2;
        case "ssa_1099":
          return options.supplementalFederalDraft.documents.socialSecurityForms.length > 0
            ? 8
            : 2;
        case "1098":
          return options.supplementalFederalDraft.documents.mortgageInterestForms.length > 0
            ? 14
            : 2;
        case "1098_e":
          return options.supplementalFederalDraft.documents.studentLoanForms.length > 0
            ? 5
            : 2;
        case "1098_t":
          return options.supplementalFederalDraft.documents.tuitionForms.length > 0
            ? 11
            : 2;
        case "1095_a": {
          const activeForm =
            options.supplementalFederalDraft.documents.marketplaceForms[
              options.selected1095AIndex
            ] ?? null;
          if (options.supplementalFederalDraft.documents.marketplaceForms.length === 0) {
            return 2;
          }
          return activeForm != null && activeForm.monthlyRows.length > 0 ? 11 : 7;
        }
        default:
          return 0;
      }
    }
    case "supplemental_income": {
      if (options.supplementalFederalDraft == null) {
        return 0;
      }

      switch (options.supplementalIncomePanel) {
        case "1099_nec":
          return options.supplementalFederalDraft.supplementalIncome.necForms.length > 0
            ? 8
            : 2;
        case "1099_misc":
          return options.supplementalFederalDraft.supplementalIncome.miscForms.length > 0
            ? 16
            : 2;
        case "schedule_c":
          return options.supplementalFederalDraft.supplementalIncome.scheduleCBusinesses
            .length > 0
            ? 17
            : 2;
        case "schedule_e":
          return options.supplementalFederalDraft.supplementalIncome.scheduleEActivities
            .length > 0
            ? 11
            : 2;
        case "other_income":
          return options.supplementalFederalDraft.supplementalIncome.otherIncomeItems.length > 0
            ? 8
            : 2;
        case "withholdings":
          return options.supplementalFederalDraft.supplementalIncome
            .supplementalWithholdings.length > 0
            ? 7
            : 2;
        default:
          return 0;
      }
    }
    case "deductions":
      if (options.supplementalFederalDraft == null) {
        return 0;
      }
      return options.deductionsPanel === "adjustments"
        ? options.supplementalFederalDraft.deductions.otherAdjustments.length > 0
          ? 18
          : 13
        : options.supplementalFederalDraft.deductions.otherItemizedDeductions.length > 0
          ? 15
          : 10;
    case "credits":
      if (options.supplementalFederalDraft == null) {
        return 0;
      }
      switch (options.creditsPanel) {
        case "candidates":
          return 5;
        case "care_providers":
          return options.supplementalFederalDraft.credits.careProviders.length > 0 ? 12 : 3;
        case "care_expenses":
          return options.supplementalFederalDraft.credits.careExpenses.length > 0 ? 6 : 2;
        case "energy":
          return options.supplementalFederalDraft.credits.residentialCleanEnergyProjects
            .length > 0
            ? 11
            : 2;
        case "vehicles":
          return options.supplementalFederalDraft.credits.cleanVehicleCredits.length > 0 ? 8 : 2;
        case "other_credits":
          return options.supplementalFederalDraft.credits.otherRefundableCredits.length > 0 ||
            options.supplementalFederalDraft.credits.otherNonrefundableCredits.length > 0
            ? 13
            : 8;
        case "hsa":
          return options.supplementalFederalDraft.credits.hsaCoverageMonths.length > 0 ? 5 : 2;
        default:
          return 0;
      }
    case "overrides":
      if (options.supplementalFederalDraft == null) {
        return 0;
      }
      return options.supplementalFederalDraft.overrides.otherElections.length > 0 ? 13 : 8;
    case "w2":
      return 11;
    case "interest":
      return 9;
    case "dividend":
      return 10;
    case "retirement":
      return 12;
    case "payments":
      return 9;
    case "banking":
      return 13;
    case "efile":
      return 5;
    case "export":
      return 2;
    case "results":
    default:
      return 0;
  }
}

const filingStatusOptions = supportedFilingStatuses.map((filingStatus) => ({
  name: formatFilingStatus(filingStatus),
  description: `Federal filing status: ${formatFilingStatus(filingStatus)}`,
  value: filingStatus,
}));

const booleanOptions: ReadonlyArray<SelectChoice<"disabled" | "enabled">> = [
  {
    name: "Disabled",
    description: "Do not include this instruction in the canonical return.",
    value: "disabled",
  },
  {
    name: "Enabled",
    description: "Include this instruction in the canonical return.",
    value: "enabled",
  },
];

const bankAccountTypeOptions: ReadonlyArray<SelectChoice<"checking" | "savings">> = [
  {
    name: "Checking",
    description: "Use a checking account.",
    value: "checking",
  },
  {
    name: "Savings",
    description: "Use a savings account.",
    value: "savings",
  },
];

const estimatedQuarterOptions: ReadonlyArray<
  SelectChoice<"Q1" | "Q2" | "Q3" | "Q4" | "other">
> = [
  {
    name: "Q1",
    description: "First-quarter estimated payment.",
    value: "Q1",
  },
  {
    name: "Q2",
    description: "Second-quarter estimated payment.",
    value: "Q2",
  },
  {
    name: "Q3",
    description: "Third-quarter estimated payment.",
    value: "Q3",
  },
  {
    name: "Q4",
    description: "Fourth-quarter estimated payment.",
    value: "Q4",
  },
  {
    name: "Other",
    description: "A payment that does not map cleanly to Q1-Q4.",
    value: "other",
  },
];

const extensionFormTypeOptions: ReadonlyArray<
  SelectChoice<"4868" | "2350" | "other">
> = [
  {
    name: "Form 4868",
    description: "Automatic extension payment.",
    value: "4868",
  },
  {
    name: "Form 2350",
    description: "Extension for certain taxpayers abroad.",
    value: "2350",
  },
  {
    name: "Other",
    description: "Another federal extension payment reference.",
    value: "other",
  },
];

const signatureMethodOptions: ReadonlyArray<
  SelectChoice<"unset" | "self_select_pin" | "practitioner_pin" | "paper">
> = [
  {
    name: "Unset",
    description: "Leave signature method blank for now.",
    value: "unset",
  },
  {
    name: "Self-select PIN",
    description: "Taxpayer signs electronically with a self-select PIN.",
    value: "self_select_pin",
  },
  {
    name: "Practitioner PIN",
    description: "Practitioner PIN path for the signer.",
    value: "practitioner_pin",
  },
  {
    name: "Paper",
    description: "Paper signature workflow.",
    value: "paper",
  },
];

function filingStatusIndex(filingStatus: SupportedFilingStatus): number {
  return supportedFilingStatuses.findIndex((value) => value === filingStatus);
}

function formatFilingStatus(filingStatus: SupportedFilingStatus): string {
  switch (filingStatus) {
    case "married_filing_jointly":
      return "Married filing jointly";
    case "married_filing_separately":
      return "Married filing separately";
    case "head_of_household":
      return "Head of household";
    case "qualifying_surviving_spouse":
      return "Qualifying surviving spouse";
    case "single":
    default:
      return "Single";
  }
}

function formatSignatureMethod(
  signatureMethod: "unset" | "self_select_pin" | "practitioner_pin" | "paper",
): string {
  switch (signatureMethod) {
    case "self_select_pin":
      return "Self-select PIN";
    case "practitioner_pin":
      return "Practitioner PIN";
    case "paper":
      return "Paper";
    case "unset":
    default:
      return "Unset";
  }
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 5) {
    return `${value.slice(0, maxLength)}`;
  }

  const segmentLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, segmentLength)}...${value.slice(value.length - segmentLength)}`;
}
