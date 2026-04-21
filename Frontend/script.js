const APP_CONFIG = {
  previewMode: "frontend",
  trainingMode: "mock",
  downloadMode: "mock",
  previewRows: 7,
  simulatedDelayMs: {
    upload: 450,
    train: 1400,
    download: 350,
  },
};

const DEMO_UPLOAD_DATASET = {
  rowCount: 1284,
  preview: [
    {
      customer_id: "C-1001",
      monthly_spend: 94.2,
      tenure_months: 18,
      support_tickets: 1,
      region: "North",
      plan_type: "Premium",
      churn: "No",
      test_field: "This field is for testing purposes.",
    },
    {
      customer_id: "C-1002",
      monthly_spend: 41.7,
      tenure_months: 6,
      support_tickets: 4,
      region: "West",
      plan_type: "Basic",
      churn: "Yes",
      test_field: "This field is for testing purposes.",
    },
    {
      customer_id: "C-1003",
      monthly_spend: 68.4,
      tenure_months: 11,
      support_tickets: 2,
      region: "East",
      plan_type: "Standard",
      churn: "No",
      test_field: "This field is for testing purposes.",
    },
    {
      customer_id: "C-1004",
      monthly_spend: 112.9,
      tenure_months: 27,
      support_tickets: 0,
      region: "South",
      plan_type: "Premium",
      churn: "No",
      test_field: "This field is for testing purposes.",
    },
    {
      customer_id: "C-1005",
      monthly_spend: 35.3,
      tenure_months: 4,
      support_tickets: 5,
      region: "North",
      plan_type: "Basic",
      churn: "Yes",
      test_field: "This field is for testing purposes.",
    },
    {
      customer_id: "C-1006",
      monthly_spend: 35.3,
      tenure_months: 4,
      support_tickets: 5,
      region: "North",
      plan_type: "Basic",
      churn: "Yes",
      test_field: "This field is for testing purposes.",
    },
  ],
};

let uploadedFile = null;
let columns = [];
let uploadedDataset = null;
let lastTrainingRun = null;

const taskTypeSelect = document.getElementById("taskType");
const targetDiv = document.getElementById("targetDiv");
const trainBtn = document.getElementById("trainBtn");
const downloadBtn = document.getElementById("downloadBtn");
const previewPanel = document.getElementById("preview");
const resultsPanel = document.getElementById("results");

initializeWorkflowMode();

taskTypeSelect.addEventListener("change", function () {
  const requiresTarget =
    this.value === "classification" || this.value === "regression";

  targetDiv.classList.toggle("is-hidden", !requiresTarget);

  if (requiresTarget) {
    loadColumns();
  }
});

function initializeWorkflowMode() {
  const modeBadge = document.getElementById("modeBadge");

  if (modeBadge) {
    modeBadge.textContent = "Local Preview + Mock Training";
  }
}

function setStatus(message, type = "info") {
  const status = document.getElementById("statusMessage");
  status.textContent = message;
  status.className = `status-banner ${type}`;
}

function setButtonLabel(button, label) {
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }

  button.textContent = label;
}

function resetButtonLabel(button) {
  if (button.dataset.defaultLabel) {
    button.textContent = button.dataset.defaultLabel;
  }
}

function setEmptyState(element, message) {
  element.classList.add("empty-state");
  element.textContent = message;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }

  return String(value);
}

function isCsvFile(file) {
  return /\.csv$/i.test(file.name);
}

function isExcelFile(file) {
  return /\.(xlsx|xls)$/i.test(file.name);
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(text) {
  const firstLine =
    text.split(/\r?\n/).find((line) => line.trim().length > 0) || "";

  const candidates = [",", ";", "\t", "|"];
  let selectedDelimiter = ",";
  let highestCount = -1;

  candidates.forEach((delimiter) => {
    const currentCount = countDelimiter(firstLine, delimiter);

    if (currentCount > highestCount) {
      highestCount = currentCount;
      selectedDelimiter = delimiter;
    }
  });

  return selectedDelimiter;
}

function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }

      row.push(field);
      field = "";

      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);

    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeaders(headerRow) {
  const seenHeaders = new Map();

  return headerRow.map((header, index) => {
    const fallbackName = `column_${index + 1}`;
    const baseName = String(header || fallbackName).trim() || fallbackName;
    const normalizedName = baseName.replace(/\s+/g, " ");
    const existingCount = seenHeaders.get(normalizedName) || 0;

    seenHeaders.set(normalizedName, existingCount + 1);

    if (existingCount === 0) {
      return normalizedName;
    }

    return `${normalizedName}_${existingCount + 1}`;
  });
}

function mapRowToObject(headers, row) {
  const record = {};

  headers.forEach((header, index) => {
    record[header] = row[index] !== undefined ? row[index].trim() : "";
  });

  return record;
}

function createCsvDataset(file, text) {
  const delimiter = detectDelimiter(text);
  const parsedRows = parseDelimitedText(text, delimiter);

  if (parsedRows.length === 0) {
    throw new Error("The selected CSV file is empty.");
  }

  const [headerRow, ...dataRows] = parsedRows;
  const headers = normalizeHeaders(headerRow);
  const preview = dataRows
    .slice(0, APP_CONFIG.previewRows)
    .map((row) => mapRowToObject(headers, row));

  return {
    source: `Local browser preview from ${file.name}`,
    sourceType: "frontend",
    columns: headers,
    preview: preview,
    rowCount: dataRows.length,
    columnCount: headers.length,
  };
}

function createDemoDataset(file) {
  const preview = DEMO_UPLOAD_DATASET.preview.map((row) => ({ ...row }));
  const demoColumns = Object.keys(preview[0] || {});

  return {
    source: `Demo preview for ${file.name}`,
    sourceType: "demo",
    columns: demoColumns,
    preview: preview,
    rowCount: DEMO_UPLOAD_DATASET.rowCount,
    columnCount: demoColumns.length,
  };
}

async function buildUploadDataset(file) {
  if (isCsvFile(file)) {
    const text = await file.text();
    return createCsvDataset(file, text);
  }

  if (isExcelFile(file)) {
    return createDemoDataset(file);
  }

  throw new Error("Please upload a CSV or Excel file.");
}

function renderPreview(dataset) {
  previewPanel.classList.remove("empty-state");
  previewPanel.innerHTML = "";

  const stack = document.createElement("div");
  stack.className = "panel-stack";

  const metaGrid = document.createElement("div");
  metaGrid.className = "dataset-meta";

  [
    { label: "Source", value: dataset.source },
    { label: "Rows Detected", value: formatValue(dataset.rowCount) },
    { label: "Columns", value: formatValue(dataset.columnCount) },
  ].forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "meta-tile";

    const label = document.createElement("span");
    label.className = "meta-label";
    label.textContent = item.label;

    const value = document.createElement("span");
    value.className = "meta-value";
    value.textContent = item.value;

    tile.appendChild(label);
    tile.appendChild(value);
    metaGrid.appendChild(tile);
  });

  stack.appendChild(metaGrid);

  if (
    Array.isArray(dataset.preview) &&
    dataset.preview.length > 0 &&
    typeof dataset.preview[0] === "object" &&
    dataset.preview[0] !== null &&
    !Array.isArray(dataset.preview[0])
  ) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";

    const table = document.createElement("table");
    table.className = "data-table";

    const previewColumns = Object.keys(dataset.preview[0]);
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    previewColumns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    dataset.preview.forEach((row) => {
      const tr = document.createElement("tr");

      previewColumns.forEach((column) => {
        const td = document.createElement("td");
        td.textContent = formatValue(row[column]);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    stack.appendChild(tableWrap);
  } else {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(dataset.preview, null, 2);
    stack.appendChild(pre);
  }

  previewPanel.appendChild(stack);
}

function loadColumns() {
  const select = document.getElementById("targetColumn");
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = columns.length
    ? "Select target column"
    : "No columns available";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  columns.forEach((columnName) => {
    const option = document.createElement("option");
    option.value = columnName;
    option.textContent = columnName;
    select.appendChild(option);
  });
}

function displayResults(data) {
  const metrics = data?.metrics || {};
  const entries = Object.entries(metrics);

  resultsPanel.innerHTML = "";

  if (entries.length === 0) {
    setEmptyState(
      resultsPanel,
      "Training finished, but no metrics were returned.",
    );
    return;
  }

  resultsPanel.classList.remove("empty-state");

  entries.forEach(([key, value]) => {
    const card = document.createElement("div");
    card.className = "metric";

    const label = document.createElement("span");
    label.className = "metric-label";
    label.textContent = key;

    const metricValue = document.createElement("span");
    metricValue.className = "metric-value";
    metricValue.textContent = formatValue(value);

    card.appendChild(label);
    card.appendChild(metricValue);
    resultsPanel.appendChild(card);
  });
}

function buildMockTrainingResponse(task, target) {
  const datasetRowCount =
    uploadedDataset?.rowCount || DEMO_UPLOAD_DATASET.rowCount;
  const datasetColumnCount =
    uploadedDataset?.columnCount ||
    Object.keys(DEMO_UPLOAD_DATASET.preview[0] || {}).length;
  const featureCount =
    task === "clustering"
      ? datasetColumnCount
      : Math.max(datasetColumnCount - (target ? 1 : 0), 1);
  const dataSource =
    uploadedDataset?.sourceType === "frontend"
      ? "Frontend local preview"
      : "Demo preview";

  if (task === "classification") {
    return {
      metrics: {
        "Best Model": "Random Forest Classifier",
        Accuracy: 0.9412,
        "F1 Score": 0.9368,
        Precision: 0.9315,
        Recall: 0.9427,
        "Target Column": target,
        "Rows Detected": datasetRowCount,
        "Feature Columns": featureCount,
      },
    };
  }

  if (task === "regression") {
    return {
      metrics: {
        "Workflow Mode": "Mock training response",
        "Best Model": "XGBoost Regressor",
        "R2 Score": 0.9134,
        RMSE: 3.4821,
        MAE: 2.1043,
        MAPE: 0.0841,
        "Target Column": target,
        "Rows Detected": datasetRowCount,
        "Feature Columns": featureCount,
        "Preview Source": dataSource,
      },
    };
  }

  return {
    metrics: {
      "Workflow Mode": "Mock training response",
      "Best Model": "K-Means Clustering",
      "Detected Clusters": 4,
      "Silhouette Score": 0.6124,
      "Davies-Bouldin": 0.7421,
      "Calinski-Harabasz": 328.514,
      "Rows Detected": datasetRowCount,
      "Feature Columns": featureCount,
      "Preview Source": dataSource,
    },
  };
}

async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const uploadBtn = document.getElementById("uploadBtn");

  if (!fileInput.files.length) {
    setStatus("Choose a CSV or Excel file before uploading.", "error");
    return;
  }

  uploadedFile = fileInput.files[0];
  lastTrainingRun = null;
  downloadBtn.disabled = true;
  trainBtn.disabled = true;

  uploadBtn.disabled = true;
  setButtonLabel(uploadBtn, "Processing...");
  setStatus(
    `Reading ${uploadedFile.name} in the browser and preparing a preview...`,
    "info",
  );
  setEmptyState(resultsPanel, "Run AutoML to display evaluation metrics.");

  try {
    await sleep(APP_CONFIG.simulatedDelayMs.upload);

    uploadedDataset = await buildUploadDataset(uploadedFile);
    columns = uploadedDataset.columns;

    renderPreview(uploadedDataset);
    loadColumns();
    trainBtn.disabled = false;

    if (
      taskTypeSelect.value === "classification" ||
      taskTypeSelect.value === "regression"
    ) {
      targetDiv.classList.remove("is-hidden");
    }

    if (uploadedDataset.sourceType === "frontend") {
      setStatus(
        `${uploadedFile.name} was previewed directly in the frontend. Training will use mock results until the backend is ready.`,
        "success",
      );
    } else {
      setStatus(
        `${uploadedFile.name} is an Excel file, so the preview is using demo data for now. Training and download remain mocked.`,
        "success",
      );
    }
  } catch (error) {
    uploadedDataset = null;
    columns = [];
    trainBtn.disabled = true;
    setEmptyState(
      previewPanel,
      "Upload a dataset to preview sample rows here.",
    );
    setStatus(
      error.message || "Unable to prepare the dataset preview.",
      "error",
    );
  } finally {
    uploadBtn.disabled = false;
    resetButtonLabel(uploadBtn);
  }
}

async function trainModel() {
  const task = taskTypeSelect.value;
  const target = document.getElementById("targetColumn").value;

  if (!uploadedDataset) {
    setStatus(
      "Upload a dataset first so the frontend can prepare a preview.",
      "error",
    );
    return;
  }

  if (!task) {
    setStatus("Select an ML task before starting training.", "error");
    return;
  }

  if ((task === "classification" || task === "regression") && !target) {
    setStatus(
      "Choose a target column for the selected supervised task.",
      "error",
    );
    return;
  }

  trainBtn.disabled = true;
  downloadBtn.disabled = true;
  setButtonLabel(trainBtn, "Training...");
  setStatus(
    "Running a mock AutoML training cycle so you can review the full workflow.",
    "info",
  );

  try {
    await sleep(APP_CONFIG.simulatedDelayMs.train);

    const data = buildMockTrainingResponse(task, target);
    lastTrainingRun = {
      fileName: uploadedFile?.name || "demo-dataset",
      task: task,
      target: target || null,
      dataset: uploadedDataset,
      metrics: data.metrics,
      trainedAt: new Date().toISOString(),
    };

    displayResults(data);
    downloadBtn.disabled = false;
    setStatus(
      "Mock training completed successfully. You can now review the sample metrics and download a demo artifact.",
      "success",
    );
  } catch (error) {
    setEmptyState(resultsPanel, "Run AutoML to display evaluation metrics.");
    setStatus(
      error.message || "Unable to complete the mock training cycle.",
      "error",
    );
  } finally {
    trainBtn.disabled = false;
    resetButtonLabel(trainBtn);
  }
}

async function downloadModel() {
  if (!lastTrainingRun) {
    setStatus(
      "Run the mock training flow before downloading the demo model artifact.",
      "error",
    );
    return;
  }

  downloadBtn.disabled = true;
  setButtonLabel(downloadBtn, "Preparing...");
  setStatus("Preparing a mock model artifact for download.", "info");

  try {
    await sleep(APP_CONFIG.simulatedDelayMs.download);

    const payload = {
      workflow_mode: "mock",
      preview_mode: APP_CONFIG.previewMode,
      training_mode: APP_CONFIG.trainingMode,
      download_mode: APP_CONFIG.downloadMode,
      generated_at: lastTrainingRun.trainedAt,
      uploaded_file: lastTrainingRun.fileName,
      task: lastTrainingRun.task,
      target: lastTrainingRun.target,
      dataset_summary: {
        source: lastTrainingRun.dataset?.source || "Demo preview",
        rows_detected:
          lastTrainingRun.dataset?.rowCount || DEMO_UPLOAD_DATASET.rowCount,
        columns_detected:
          lastTrainingRun.dataset?.columnCount || columns.length,
      },
      metrics: lastTrainingRun.metrics,
      note: "This is a frontend-generated mock artifact for workflow review while backend development is in progress.",
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "mock-model-artifact.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setStatus("Mock model artifact downloaded successfully.", "success");
  } catch (error) {
    setStatus(
      error.message || "Unable to generate the mock model artifact.",
      "error",
    );
  } finally {
    downloadBtn.disabled = false;
    resetButtonLabel(downloadBtn);
  }
}
