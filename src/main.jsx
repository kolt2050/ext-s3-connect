import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Disc3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderPlus,
  Image,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Moon,
  Sun,
  File,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import "./styles.css";

const STORAGE_KEY = "s3ObsConnections";
const THEME_STORAGE_KEY = "s3ObsTheme";
const PAGE_SIZE = 1000;

const emptyForm = {
  accessKeyId: "",
  secretAccessKey: "",
  accessPath: "",
  serverAddress: "",
};

function getChromeStorage() {
  if (globalThis.chrome?.storage?.local) {
    return globalThis.chrome.storage.local;
  }
  return null;
}

function parseAccessPath(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("obs://")) {
    throw new Error("Access Path must start with obs://");
  }

  const withoutScheme = trimmed.slice("obs://".length);
  const slashIndex = withoutScheme.indexOf("/");
  const bucket = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
  const rawPrefix = slashIndex === -1 ? "" : withoutScheme.slice(slashIndex + 1);

  if (!bucket) {
    throw new Error("Access Path must include a bucket name");
  }

  return {
    bucket,
    prefix: normalizePrefix(rawPrefix),
  };
}

function normalizePrefix(prefix) {
  const clean = prefix.replace(/^\/+/, "");
  if (!clean) {
    return "";
  }
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function normalizeSearchPrefix(prefix = "") {
  return prefix.replace(/^\/+/, "");
}

function formatPath(bucket, prefix) {
  return `obs://${bucket}/${prefix || ""}`;
}

function createConnection(form) {
  const parsed = parseAccessPath(form.accessPath);
  const serverAddress = form.serverAddress.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const region = inferRegion(serverAddress);

  if (!form.accessKeyId.trim()) {
    throw new Error("AK is required");
  }
  if (!form.secretAccessKey.trim()) {
    throw new Error("SK is required");
  }
  if (!serverAddress) {
    throw new Error("Server Address is required");
  }

  const now = Date.now();
  return {
    id: `${parsed.bucket}-${now}`,
    accessKeyId: form.accessKeyId.trim(),
    secretAccessKey: form.secretAccessKey,
    serverAddress,
    region,
    bucket: parsed.bucket,
    prefix: parsed.prefix,
    tokenStack: [undefined],
    tokenIndex: 0,
    pageNumber: 1,
    searchPrefix: "",
    sort: { field: "name", direction: "asc" },
    showLogs: false,
    logs: [
      `${new Date().toLocaleString()} Connected to ${formatPath(parsed.bucket, parsed.prefix)} (${region})`,
    ],
    createdAt: now,
  };
}

function inferRegion(serverAddress) {
  const match = serverAddress.match(/^obs\.([a-z0-9-]+)\./i);
  return match?.[1] || "us-east-1";
}

function makeClient(connection) {
  return new S3Client({
    region: connection.region || inferRegion(connection.serverAddress),
    endpoint: `https://${connection.serverAddress}`,
    forcePathStyle: false,
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
    },
  });
}

function byteSize(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPageLabel(pageNumber, hasNext) {
  if (hasNext) {
    return `Page ${pageNumber} of ${pageNumber + 1}+`;
  }
  return `Page ${pageNumber} of ${pageNumber}`;
}

function getFileExtension(name = "") {
  const cleanName = name.toLowerCase().split("?")[0].split("#")[0];
  const dotIndex = cleanName.lastIndexOf(".");
  return dotIndex === -1 ? "" : cleanName.slice(dotIndex);
}

function isTextPreviewable(file, contentType = "") {
  const type = contentType.toLowerCase();
  const extension = getFileExtension(file.name || file.key);
  const textExtensions = new Set([
    ".cfg",
    ".conf",
    ".csv",
    ".env",
    ".ini",
    ".js",
    ".json",
    ".log",
    ".md",
    ".properties",
    ".sql",
    ".text",
    ".toml",
    ".ts",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
  ]);

  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("yaml") ||
    textExtensions.has(extension)
  );
}

function isImagePreviewable(file, contentType = "") {
  const type = contentType.toLowerCase();
  const extension = getFileExtension(file.name || file.key);
  const imageExtensions = new Set([
    ".avif",
    ".bmp",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".webp",
  ]);

  return type.startsWith("image/") || imageExtensions.has(extension);
}

function isAudioFile(file) {
  const extension = getFileExtension(file.name || file.key);
  const audioExtensions = new Set([
    ".aac",
    ".aif",
    ".aiff",
    ".flac",
    ".m4a",
    ".mid",
    ".midi",
    ".mp3",
    ".oga",
    ".ogg",
    ".opus",
    ".wav",
    ".wma",
  ]);

  return audioExtensions.has(extension);
}

function isVideoFile(file) {
  const extension = getFileExtension(file.name || file.key);
  const videoExtensions = new Set([
    ".3gp",
    ".avi",
    ".m2ts",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".ogv",
    ".ts",
    ".webm",
    ".wmv",
  ]);

  return videoExtensions.has(extension);
}

function getObjectType(row) {
  if (row.type === "folder") {
    return "folder";
  }

  const extension = getFileExtension(row.name || row.key);
  if (isImagePreviewable(row)) {
    return "image";
  }
  if (isAudioFile(row)) {
    return "audio";
  }
  if (isVideoFile(row)) {
    return "video";
  }
  if (isTextPreviewable(row)) {
    return extension === ".log" ? "log" : "text";
  }
  return extension ? extension.slice(1) : "file";
}

function sortRows(rows, sort) {
  if (!rows) {
    return { folders: [], files: [] };
  }

  const direction = sort?.direction === "desc" ? -1 : 1;
  const compare = (left, right) => {
    const leftValue = sort?.field === "type" ? getObjectType(left) : left.name;
    const rightValue = sort?.field === "type" ? getObjectType(right) : right.name;
    return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" }) * direction;
  };

  return {
    folders: [...rows.folders].sort(compare),
    files: [...rows.files].sort(compare),
  };
}

function getFileIcon(file) {
  if (isImagePreviewable(file)) {
    return <Image size={17} className="file-type-icon image-type" />;
  }
  if (isAudioFile(file)) {
    return <Disc3 size={17} className="file-type-icon audio-type" />;
  }
  if (isVideoFile(file)) {
    return <Video size={17} className="file-type-icon video-type" />;
  }

  const extension = getFileExtension(file.name || file.key);
  if (extension === ".txt") {
    return <FileText size={17} className="file-type-icon text-type" />;
  }

  return <File size={17} className="file-type-icon default-type" />;
}

function App() {
  const [connections, setConnections] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [rowsByConnection, setRowsByConnection] = useState({});
  const [loadingByConnection, setLoadingByConnection] = useState({});
  const [selectedByConnection, setSelectedByConnection] = useState({});
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [theme, setTheme] = useState("light");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [previewProgress, setPreviewProgress] = useState(null);
  const [draggedTabId, setDraggedTabId] = useState("");
  const fileInputRef = useRef(null);
  const modalResolverRef = useRef(null);

  const active = useMemo(
    () => connections.find((connection) => connection.id === activeId) || null,
    [connections, activeId],
  );

  useEffect(() => {
    const storage = getChromeStorage();
    if (!storage) {
      return;
    }

    storage.get(STORAGE_KEY, (result) => {
      const saved = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
      setConnections(saved);
      setActiveId(saved[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    const storage = getChromeStorage();
    if (!storage) {
      return;
    }

    storage.get(THEME_STORAGE_KEY, (result) => {
      if (result[THEME_STORAGE_KEY] === "dark" || result[THEME_STORAGE_KEY] === "light") {
        setTheme(result[THEME_STORAGE_KEY]);
      }
    });
  }, []);

  useEffect(() => {
    const storage = getChromeStorage();
    if (!storage) {
      return;
    }

    storage.set({ [STORAGE_KEY]: connections });
  }, [connections]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const storage = getChromeStorage();
    if (storage) {
      storage.set({ [THEME_STORAGE_KEY]: theme });
    }
  }, [theme]);

  useEffect(() => {
    if (active && !rowsByConnection[active.id] && !loadingByConnection[active.id]) {
      loadPage(active.id, active.tokenIndex);
    }
  }, [activeId, connections]);

  useEffect(() => {
    document.title = active ? formatPath(active.bucket, active.prefix) : "S3/OBS Connect";
  }, [active]);

  function updateConnection(id, updater) {
    setConnections((current) =>
      current.map((connection) => (connection.id === id ? updater(connection) : connection)),
    );
  }

  function appendLog(id, message) {
    updateConnection(id, (connection) => ({
      ...connection,
      logs: [`${new Date().toLocaleString()} ${message}`, ...connection.logs].slice(0, 300),
    }));
  }

  function openModal(config) {
    return new Promise((resolve) => {
      modalResolverRef.current = resolve;
      setModal(config);
    });
  }

  function closeModal(result) {
    modalResolverRef.current?.(result);
    modalResolverRef.current = null;
    setModal(null);
  }

  function showAlert(message, title = "Error") {
    return openModal({ type: "alert", title, message });
  }

  function showConfirm(message, title = "Confirm", intent = "default") {
    return openModal({ type: "confirm", title, message, intent });
  }

  function showPrompt(message, title = "Input") {
    return openModal({ type: "prompt", title, message, defaultValue: "" });
  }

  async function loadPage(connectionId, tokenIndex = 0, options = {}) {
    const connection = connections.find((item) => item.id === connectionId);
    if (!connection) {
      return;
    }

    const nextPrefix = options.overridePrefix ?? connection.prefix;
    const nextSearchPrefix = normalizeSearchPrefix(
      options.overrideSearchPrefix ?? connection.searchPrefix ?? "",
    );
    const listPrefix = `${nextPrefix}${nextSearchPrefix}`;
    const token = connection.tokenStack[tokenIndex];

    setLoadingByConnection((state) => ({ ...state, [connectionId]: true }));

    try {
      const client = makeClient(connection);
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: connection.bucket,
          Prefix: listPrefix,
          Delimiter: "/",
          MaxKeys: PAGE_SIZE,
          ContinuationToken: token,
        }),
      );

      const folders = (response.CommonPrefixes || []).map((item) => ({
        key: item.Prefix,
        name: item.Prefix.slice(nextPrefix.length).replace(/\/$/, ""),
        type: "folder",
      }));

      const files = (response.Contents || [])
        .filter((item) => item.Key !== nextPrefix)
        .map((item) => ({
          key: item.Key,
          name: item.Key.slice(nextPrefix.length),
          size: item.Size,
          modified: item.LastModified ? new Date(item.LastModified).toLocaleString() : "",
          type: "file",
        }))
        .filter((item) => item.name);

      const nextTokenStack = [...connection.tokenStack.slice(0, tokenIndex + 1)];
      if (response.NextContinuationToken) {
        nextTokenStack[tokenIndex + 1] = response.NextContinuationToken;
      }

      updateConnection(connectionId, (current) => ({
        ...current,
        prefix: nextPrefix,
        searchPrefix: nextSearchPrefix,
        tokenIndex,
        pageNumber: tokenIndex + 1,
        tokenStack: nextTokenStack,
      }));

      setRowsByConnection((state) => ({
        ...state,
        [connectionId]: {
          folders,
          files,
          hasNext: Boolean(response.NextContinuationToken),
          loadedAt: new Date().toLocaleTimeString(),
        },
      }));
      setSelectedByConnection((state) => ({ ...state, [connectionId]: [] }));
      appendLog(
        connectionId,
        `Loaded ${formatPath(connection.bucket, nextPrefix)}${nextSearchPrefix ? ` with prefix ${nextSearchPrefix}` : ""}`,
      );
    } catch (error) {
      appendLog(connectionId, `Error: ${error.message}`);
      setRowsByConnection((state) => ({
        ...state,
        [connectionId]: {
          folders: [],
          files: [],
          hasNext: false,
          error: error.message,
          loadedAt: new Date().toLocaleTimeString(),
        },
      }));
    } finally {
      setLoadingByConnection((state) => ({ ...state, [connectionId]: false }));
    }
  }

  async function connect(event) {
    event.preventDefault();

    try {
      const connection = createConnection(form);
      setConnections((current) => [connection, ...current]);
      setActiveId(connection.id);
      setForm(emptyForm);
    } catch (error) {
      await showAlert(error.message);
    }
  }

  function openFolder(prefix) {
    if (!active) {
      return;
    }
    updateConnection(active.id, (connection) => ({
      ...connection,
      tokenStack: [undefined],
      tokenIndex: 0,
      pageNumber: 1,
      searchPrefix: "",
    }));
    loadPage(active.id, 0, { overridePrefix: prefix, overrideSearchPrefix: "" });
  }

  function searchCurrentPrefix(event) {
    event.preventDefault();
    if (!active) {
      return;
    }

    const nextSearchPrefix = normalizeSearchPrefix(active.searchPrefix || "");
    updateConnection(active.id, (connection) => ({
      ...connection,
      searchPrefix: nextSearchPrefix,
      tokenStack: [undefined],
      tokenIndex: 0,
      pageNumber: 1,
    }));
    loadPage(active.id, 0, { overrideSearchPrefix: nextSearchPrefix });
  }

  function clearSearch() {
    if (!active) {
      return;
    }

    updateConnection(active.id, (connection) => ({
      ...connection,
      searchPrefix: "",
      tokenStack: [undefined],
      tokenIndex: 0,
      pageNumber: 1,
    }));
    loadPage(active.id, 0, { overrideSearchPrefix: "" });
  }

  function goToPage(direction) {
    if (!active) {
      return;
    }

    const rows = rowsByConnection[active.id];
    if (direction === "next" && rows?.hasNext) {
      loadPage(active.id, active.tokenIndex + 1);
    }
    if (direction === "prev" && active.tokenIndex > 0) {
      loadPage(active.id, active.tokenIndex - 1);
    }
  }

  function refresh() {
    if (!active) {
      return;
    }
    loadPage(active.id, active.tokenIndex);
  }

  async function uploadFiles(files) {
    if (!active || !files?.length) {
      return;
    }

    const fileList = Array.from(files);
    setLoadingByConnection((state) => ({ ...state, [active.id]: true }));
    setUploadProgress({
      current: 0,
      total: fileList.length,
      label: "Preparing upload",
    });
    try {
      const client = makeClient(active);
      for (const [index, file] of fileList.entries()) {
        setUploadProgress({
          current: index,
          total: fileList.length,
          label: `Uploading ${file.name}`,
        });
        const body = new Uint8Array(await file.arrayBuffer());
        await client.send(
          new PutObjectCommand({
            Bucket: active.bucket,
            Key: `${active.prefix}${file.name}`,
            Body: body,
            ContentType: file.type || "application/octet-stream",
            ContentLength: file.size,
          }),
        );
        appendLog(active.id, `Uploaded ${file.name}`);
        setUploadProgress({
          current: index + 1,
          total: fileList.length,
          label: `Uploaded ${file.name}`,
        });
      }
      await loadPage(active.id, active.tokenIndex);
    } catch (error) {
      appendLog(active.id, `Upload error: ${error.message}`);
    } finally {
      setLoadingByConnection((state) => ({ ...state, [active.id]: false }));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadProgress(null);
    }
  }

  function handleDragOver(event) {
    if (!active) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  }

  function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsDraggingFiles(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDraggingFiles(false);

    if (!active || isLoading) {
      return;
    }

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      uploadFiles(files);
    }
  }

  async function createFolder() {
    if (!active) {
      return;
    }

    const folderName = await showPrompt("Folder name", "Create folder");
    if (!folderName) {
      return;
    }

    const cleanName = folderName.replace(/^\/+|\/+$/g, "");
    if (!cleanName) {
      return;
    }

    try {
      const client = makeClient(active);
      await client.send(
        new PutObjectCommand({
          Bucket: active.bucket,
          Key: `${active.prefix}${cleanName}/`,
          Body: "",
        }),
      );
      appendLog(active.id, `Created folder ${cleanName}`);
      await loadPage(active.id, active.tokenIndex);
    } catch (error) {
      appendLog(active.id, `Create folder error: ${error.message}`);
    }
  }

  async function deleteObjects(keys) {
    if (!active || keys.length === 0) {
      return;
    }

    const confirmed = await showConfirm(`Delete ${keys.length} object(s)?`, "Delete objects", "danger");
    if (!confirmed) {
      return;
    }

    try {
      const client = makeClient(active);
      if (keys.length === 1) {
        await client.send(new DeleteObjectCommand({ Bucket: active.bucket, Key: keys[0] }));
      } else {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: active.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
          }),
        );
      }
      appendLog(active.id, `Deleted ${keys.length} object(s)`);
      await loadPage(active.id, active.tokenIndex);
    } catch (error) {
      appendLog(active.id, `Delete error: ${error.message}`);
    }
  }

  async function downloadFile(file) {
    if (!active) {
      return;
    }

    setLoadingByConnection((state) => ({ ...state, [active.id]: true }));
    setPreviewProgress({ label: `Loading ${file.name}` });

    try {
      const client = makeClient(active);
      const response = await client.send(
        new GetObjectCommand({
          Bucket: active.bucket,
          Key: file.key,
        }),
      );
      const bytes = await response.Body.transformToByteArray();
      const blob = new Blob([bytes], {
        type: response.ContentType || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name.split("/").pop() || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      appendLog(active.id, `Downloaded ${file.key}`);
    } catch (error) {
      appendLog(active.id, `Download error: ${error.message}`);
      await showAlert(error.message, "Download failed");
    } finally {
      setLoadingByConnection((state) => ({ ...state, [active.id]: false }));
    }
  }

  async function previewFile(file) {
    if (!active) {
      return;
    }

    setLoadingByConnection((state) => ({ ...state, [active.id]: true }));

    try {
      const client = makeClient(active);
      const response = await client.send(
        new GetObjectCommand({
          Bucket: active.bucket,
          Key: file.key,
        }),
      );
      const contentType = response.ContentType || "";

      if (
        !isTextPreviewable(file, contentType) &&
        !isImagePreviewable(file, contentType) &&
        !isAudioFile(file) &&
        !isVideoFile(file)
      ) {
        await showAlert("This file type is not available for preview.", "Preview unavailable");
        return;
      }

      const bytes = await response.Body.transformToByteArray();
      const blob = new Blob([bytes], {
        type: contentType || "application/octet-stream",
      });

      if (isImagePreviewable(file, contentType)) {
        const url = URL.createObjectURL(blob);
        setPreview({
          type: "image",
          title: file.name,
          downloadName: file.name.split("/").pop() || "download",
          url,
          size: file.size,
          contentType: contentType || "image/*",
        });
        appendLog(active.id, `Previewed image ${file.key}`);
        return;
      }

      if (isAudioFile(file)) {
        const url = URL.createObjectURL(blob);
        setPreview({
          type: "audio",
          title: file.name,
          downloadName: file.name.split("/").pop() || "audio",
          url,
          size: file.size,
          contentType: contentType || "audio/*",
        });
        appendLog(active.id, `Previewed audio ${file.key}`);
        return;
      }

      if (isVideoFile(file)) {
        const url = URL.createObjectURL(blob);
        setPreview({
          type: "video",
          title: file.name,
          downloadName: file.name.split("/").pop() || "video",
          url,
          size: file.size,
          contentType: contentType || "video/*",
        });
        appendLog(active.id, `Previewed video ${file.key}`);
        return;
      }

      const text = await blob.text();
      setPreview({
        type: "text",
        title: file.name,
        downloadName: file.name.split("/").pop() || "download.txt",
        text,
        size: file.size,
        contentType: contentType || "text/plain",
      });
      appendLog(active.id, `Previewed text ${file.key}`);
    } catch (error) {
      appendLog(active.id, `Preview error: ${error.message}`);
      await showAlert(error.message, "Preview failed");
    } finally {
      setLoadingByConnection((state) => ({ ...state, [active.id]: false }));
      setPreviewProgress(null);
    }
  }

  function closePreview() {
    if ((preview?.type === "image" || preview?.type === "audio" || preview?.type === "video") && preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  }

  function downloadPreview() {
    if (!preview) {
      return;
    }

    const url =
      preview.type === "image" || preview.type === "audio" || preview.type === "video"
        ? preview.url
        : URL.createObjectURL(
            new Blob([preview.text], {
              type: preview.contentType || "text/plain",
            }),
          );

    const link = document.createElement("a");
    link.href = url;
    link.download = preview.downloadName || "download";
    document.body.appendChild(link);
    link.click();
    link.remove();

    if (preview.type !== "image" && preview.type !== "audio" && preview.type !== "video") {
      URL.revokeObjectURL(url);
    }
  }

  function canPreviewFile(file) {
    return isTextPreviewable(file) || isImagePreviewable(file) || isAudioFile(file) || isVideoFile(file);
  }

  async function deleteFolder(prefix) {
    if (!active) {
      return;
    }

    const confirmed = await showConfirm(
      `Delete folder ${prefix} and all objects inside?`,
      "Delete folder recursively",
      "danger",
    );
    if (!confirmed) {
      return;
    }

    setLoadingByConnection((state) => ({ ...state, [active.id]: true }));

    try {
      const client = makeClient(active);
      let continuationToken;
      let deletedCount = 0;

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: active.bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
          }),
        );

        const keys = (response.Contents || []).map((item) => item.Key).filter(Boolean);
        for (let index = 0; index < keys.length; index += 1000) {
          const chunk = keys.slice(index, index + 1000);
          if (chunk.length === 1) {
            await client.send(new DeleteObjectCommand({ Bucket: active.bucket, Key: chunk[0] }));
          } else if (chunk.length > 1) {
            await client.send(
              new DeleteObjectsCommand({
                Bucket: active.bucket,
                Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: false },
              }),
            );
          }
          deletedCount += chunk.length;
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      appendLog(active.id, `Deleted folder ${prefix} (${deletedCount} object(s))`);
      await loadPage(active.id, active.tokenIndex);
    } catch (error) {
      appendLog(active.id, `Delete folder error: ${error.message}`);
      await showAlert(error.message, "Delete folder failed");
    } finally {
      setLoadingByConnection((state) => ({ ...state, [active.id]: false }));
    }
  }

  function toggleSelection(key) {
    if (!active) {
      return;
    }

    setSelectedByConnection((state) => {
      const selected = new Set(state[active.id] || []);
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      return { ...state, [active.id]: [...selected] };
    });
  }

  function closeConnectionNow(connectionId) {
    const closingActive = connectionId === activeId;
    const remaining = connections.filter((connection) => connection.id !== connectionId);

    setConnections(remaining);
    if (closingActive) {
      setActiveId(remaining[0]?.id || "");
    }
    setRowsByConnection((state) => {
      const next = { ...state };
      delete next[connectionId];
      return next;
    });
    setSelectedByConnection((state) => {
      const next = { ...state };
      delete next[connectionId];
      return next;
    });
  }

  async function confirmCloseConnection(connectionId) {
    const connection = connections.find((item) => item.id === connectionId);
    if (!connection) {
      return;
    }

    const confirmed = await showConfirm(
      `Close connection ${formatPath(connection.bucket, connection.prefix)}?`,
      "Logout",
      "danger",
    );
    if (confirmed) {
      closeConnectionNow(connectionId);
    }
  }

  function logout() {
    if (!active) {
      return;
    }

    confirmCloseConnection(active.id);
  }

  function openNewTab() {
    setActiveId("");
  }

  function changeSort(field) {
    if (!active) {
      return;
    }

    updateConnection(active.id, (connection) => {
      const currentSort = connection.sort || { field: "name", direction: "asc" };
      const nextDirection =
        currentSort.field === field && currentSort.direction === "asc" ? "desc" : "asc";
      return {
        ...connection,
        sort: { field, direction: nextDirection },
      };
    });
  }

  function moveTab(dragId, targetId) {
    if (!dragId || !targetId || dragId === targetId) {
      return;
    }

    setConnections((current) => {
      const dragIndex = current.findIndex((connection) => connection.id === dragId);
      const targetIndex = current.findIndex((connection) => connection.id === targetId);
      if (dragIndex === -1 || targetIndex === -1) {
        return current;
      }

      const next = [...current];
      const [dragged] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, dragged);
      return next;
    });
  }

  const rows = active ? rowsByConnection[active.id] : null;
  const sortedRows = sortRows(rows, active?.sort);
  const selected = active ? selectedByConnection[active.id] || [] : [];
  const isLoading = active ? Boolean(loadingByConnection[active.id]) : false;

  return (
    <main className="app-shell">
      <section className="sidebar">
        <div className="brand">
          <div className="brand-mark">S3</div>
          <div>
            <h1>S3/OBS Connect</h1>
            <p>Chrome bucket manager</p>
          </div>
        </div>

        <form className="connect-form" onSubmit={connect}>
          <label>
            AK
            <input
              value={form.accessKeyId}
              onChange={(event) => setForm({ ...form, accessKeyId: event.target.value })}
              autoComplete="off"
            />
          </label>
          <label>
            SK
            <input
              type="password"
              value={form.secretAccessKey}
              onChange={(event) => setForm({ ...form, secretAccessKey: event.target.value })}
              autoComplete="off"
            />
          </label>
          <label>
            Access Path
            <input
              value={form.accessPath}
              onChange={(event) => setForm({ ...form, accessPath: event.target.value })}
              placeholder="obs://mybucket/folder"
              autoComplete="off"
            />
          </label>
          <label>
            Server Address
            <input
              value={form.serverAddress}
              onChange={(event) => setForm({ ...form, serverAddress: event.target.value })}
              autoComplete="off"
            />
          </label>
          <button type="submit" className="primary-button">
            Connect
          </button>
        </form>
      </section>

      <section className="workspace">
        <div className="tab-strip">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className={[
                "tab",
                connection.id === activeId ? "active" : "",
                connection.id === draggedTabId ? "dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={formatPath(connection.bucket, connection.prefix)}
              draggable
              onDragStart={(event) => {
                setDraggedTabId(connection.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", connection.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const dragId = event.dataTransfer.getData("text/plain") || draggedTabId;
                moveTab(dragId, connection.id);
                setDraggedTabId("");
              }}
              onDragEnd={() => setDraggedTabId("")}
            >
              <button className="tab-title" onClick={() => setActiveId(connection.id)}>
                {formatPath(connection.bucket, connection.prefix)}
              </button>
              <button
                className="tab-close"
                onClick={() => confirmCloseConnection(connection.id)}
                title="Close tab"
                aria-label={`Close ${formatPath(connection.bucket, connection.prefix)}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button className="new-tab-button" onClick={openNewTab} title="New connection tab">
            <Plus size={17} />
          </button>
        </div>

        {!active ? (
          <div className="empty-state">
            <Folder size={48} />
            <h2>No active bucket</h2>
            <p>Fill in the connection fields and connect to an OBS/S3-compatible bucket.</p>
          </div>
        ) : (
          <>
            <header className="path-header">
              <Breadcrumb bucket={active.bucket} prefix={active.prefix} onOpen={openFolder} />
              <form className="prefix-search" onSubmit={searchCurrentPrefix}>
                <Search size={16} />
                <input
                  value={active.searchPrefix || ""}
                  onChange={(event) =>
                    updateConnection(active.id, (connection) => ({
                      ...connection,
                      searchPrefix: event.target.value,
                    }))
                  }
                  placeholder="Prefix search in this folder"
                  autoComplete="off"
                />
                {active.searchPrefix ? (
                  <button type="button" onClick={clearSearch} title="Clear search">
                    <X size={15} />
                  </button>
                ) : null}
                <button type="submit">Search</button>
              </form>
              <div className="toolbar">
                <button onClick={refresh} disabled={isLoading} title="Refresh">
                  <RefreshCw size={18} />
                </button>
                <button onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="Upload files">
                  <Upload size={18} />
                </button>
                <button onClick={createFolder} disabled={isLoading} title="Create folder">
                  <FolderPlus size={18} />
                </button>
                <button
                  onClick={() => deleteObjects(selected)}
                  disabled={isLoading || selected.length === 0}
                  title="Delete selected"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={() =>
                    updateConnection(active.id, (connection) => ({
                      ...connection,
                      showLogs: !connection.showLogs,
                    }))
                  }
                  title={active.showLogs ? "Hide logs" : "Show logs"}
                >
                  {active.showLogs ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <button
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  title={theme === "dark" ? "Light theme" : "Dark theme"}
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <button onClick={logout} title="Logout">
                  <LogOut size={18} />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => uploadFiles(event.target.files)}
              />
            </header>

            <div
              className={isDraggingFiles ? "table-panel drag-active" : "table-panel"}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {uploadProgress ? <UploadProgress progress={uploadProgress} /> : null}
              {isDraggingFiles ? <div className="drop-overlay">Drop files to upload</div> : null}
              <table>
                <thead>
                  <tr>
                    <th className="check-cell"></th>
                    <th>
                      <button className="sort-button" onClick={() => changeSort("name")}>
                        Name
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th>
                      <button className="sort-button" onClick={() => changeSort("type")}>
                        Type
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th className="action-cell"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.folders.map((folder) => (
                    <tr key={folder.key}>
                      <td className="check-cell"></td>
                      <td>
                        <button className="name-button" onClick={() => openFolder(folder.key)}>
                          <Folder size={17} />
                          {folder.name}
                        </button>
                      </td>
                      <td>Folder</td>
                      <td></td>
                      <td></td>
                      <td className="action-cell">
                        <div className="row-actions">
                          <button onClick={() => deleteFolder(folder.key)} title="Delete folder recursively">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedRows.files.map((file) => (
                    <tr key={file.key}>
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          checked={selected.includes(file.key)}
                          onChange={() => toggleSelection(file.key)}
                        />
                      </td>
                      <td>
                        {canPreviewFile(file) ? (
                          <button className="file-name preview-link" onClick={() => previewFile(file)} title="Preview file">
                            {getFileIcon(file)}
                            {file.name}
                          </button>
                        ) : (
                          <span className="file-name">
                            {getFileIcon(file)}
                            {file.name}
                          </span>
                        )}
                      </td>
                      <td>{getObjectType(file)}</td>
                      <td>{byteSize(file.size)}</td>
                      <td>{file.modified}</td>
                      <td className="action-cell">
                        <div className="row-actions">
                          <button onClick={() => downloadFile(file)} title="Download file">
                            <Download size={16} />
                          </button>
                          <button onClick={() => deleteObjects([file.key])} title="Delete object">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && rows && rows.folders.length === 0 && rows.files.length === 0 && (
                    <tr>
                      <td colSpan="5" className="empty-row">
                        {rows.error || "This prefix is empty"}
                      </td>
                    </tr>
                  )}
                  {isLoading && (
                    <tr>
                      <td colSpan="5" className="empty-row">
                        Loading objects...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <footer className="pager">
              <button onClick={() => goToPage("prev")} disabled={active.tokenIndex === 0 || isLoading}>
                <ChevronLeft size={17} />
                Previous
              </button>
              <span>{formatPageLabel(active.pageNumber, Boolean(rows?.hasNext))}</span>
              <button onClick={() => goToPage("next")} disabled={!rows?.hasNext || isLoading}>
                Next
                <ChevronRight size={17} />
              </button>
            </footer>

            {active.showLogs && (
              <aside className="logs">
                {active.logs.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </aside>
            )}
          </>
        )}
      </section>
      {modal ? <Modal modal={modal} onClose={closeModal} /> : null}
      {preview ? <PreviewDialog preview={preview} onClose={closePreview} onDownload={downloadPreview} /> : null}
      {previewProgress ? <PreviewProgress label={previewProgress.label} /> : null}
    </main>
  );
}

function UploadProgress({ progress }) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="upload-progress">
      <div className="progress-row">
        <span>{progress.label}</span>
        <strong>
          {progress.current}/{progress.total}
        </strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function PreviewProgress({ label }) {
  return (
    <div className="modal-backdrop preview-loading-backdrop" role="presentation">
      <div className="preview-loading" role="status">
        <span>{label}</span>
        <div className="progress-track indeterminate">
          <div className="progress-fill" />
        </div>
      </div>
    </div>
  );
}

function PreviewDialog({ preview, onClose, onDownload }) {
  const [imageSize, setImageSize] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const imageMaxWidth = "calc(100vw - 80px)";
  const imageMaxHeight = "calc(100vh - 150px)";
  const dialogClass =
    preview.type === "image"
      ? "preview-dialog image-dialog"
      : preview.type === "audio"
        ? "preview-dialog audio-dialog"
        : preview.type === "video"
          ? "preview-dialog video-dialog"
          : "preview-dialog text-dialog";
  const imageDialogStyle =
    preview.type === "image" && imageSize
      ? {
          width: `min(${imageSize.width}px, calc(100vw - 48px))`,
          height: `min(${imageSize.height + 74}px, calc(100vh - 48px))`,
        }
      : undefined;

  return (
    <div className="modal-backdrop preview-backdrop" role="presentation">
      <section
        className={dialogClass}
        style={imageDialogStyle}
        role="dialog"
        aria-modal="true"
      >
        <header className="preview-header">
          <div>
            <h2>{preview.title}</h2>
            <p>
              {preview.contentType}
              {Number.isFinite(preview.size) ? ` - ${byteSize(preview.size)}` : ""}
              {imageSize ? ` - ${imageSize.width} x ${imageSize.height}` : ""}
            </p>
          </div>
          <div className="preview-actions">
            <button onClick={onDownload} title="Download file">
              <Download size={18} />
            </button>
            <button onClick={onClose} title="Close preview">
              <X size={18} />
            </button>
          </div>
        </header>
        <div
          className={
            preview.type === "image"
              ? "preview-body image-preview"
              : preview.type === "audio"
                ? "preview-body audio-preview"
                : preview.type === "video"
                  ? "preview-body video-preview"
                  : "preview-body text-preview"
          }
        >
          {preview.type === "image" ? (
            <img
              src={preview.url}
              alt={preview.title}
              style={{ maxWidth: imageMaxWidth, maxHeight: imageMaxHeight }}
              onLoad={(event) =>
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
            />
          ) : preview.type === "audio" ? (
            <div className="audio-player-panel">
              <Disc3 size={42} />
              <div className="media-player-stack">
                <audio
                  controls
                  src={preview.url}
                  onError={() =>
                    setMediaError("Unable to play this audio format in the browser. Try downloading the file.")
                  }
                />
                {mediaError ? <p className="media-error">{mediaError}</p> : null}
              </div>
            </div>
          ) : preview.type === "video" ? (
            <div className="video-player-panel">
              <video
                controls
                src={preview.url}
                onError={() =>
                  setMediaError("Unable to play this video format in the browser. Try downloading the file.")
                }
              />
              {mediaError ? <p className="media-error">{mediaError}</p> : null}
            </div>
          ) : (
            <pre>{preview.text}</pre>
          )}
        </div>
      </section>
    </div>
  );
}

function Modal({ modal, onClose }) {
  const [value, setValue] = useState(modal.defaultValue || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (modal.type === "prompt") {
      inputRef.current?.focus();
    }
  }, [modal.type]);

  function submit(event) {
    event.preventDefault();
    if (modal.type === "prompt") {
      onClose(value);
      return;
    }
    onClose(true);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className={modal.intent === "danger" ? "modal-dialog danger" : "modal-dialog"}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
      >
        <h2>{modal.title}</h2>
        <p>{modal.message}</p>
        {modal.type === "prompt" ? (
          <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} />
        ) : null}
        <div className="modal-actions">
          {modal.type !== "alert" ? (
            <button type="button" onClick={() => onClose(false)}>
              Cancel
            </button>
          ) : null}
          <button type="submit" className={modal.intent === "danger" ? "danger-button" : "primary-button"}>
            {modal.type === "alert" ? "OK" : "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Breadcrumb({ bucket, prefix, onOpen }) {
  const parts = prefix.split("/").filter(Boolean);

  return (
    <nav className="breadcrumb" aria-label="Current bucket path">
      <button onClick={() => onOpen("")}>obs://{bucket}</button>
      {parts.map((part, index) => {
        const targetPrefix = `${parts.slice(0, index + 1).join("/")}/`;
        return (
          <React.Fragment key={targetPrefix}>
            <span>/</span>
            <button onClick={() => onOpen(targetPrefix)}>{part}</button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

createRoot(document.getElementById("root")).render(<App />);
