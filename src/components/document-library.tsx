"use client";
import TrackingTables from "./tracking-tables";
import { apiFetch } from "@/lib/offline";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Folder,
  FileText,
  Upload,
  Search,
  ChevronLeft,
  Plus,
  Download,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import {
  documentFolders,
  descendants,
  folderPath,
  documentExtensions,
  type DocumentSection,
  type DocumentFolder,
} from "@/lib/document-folders";
import {prepareDocumentFiles,validateDocumentFiles,type DocumentUploadCache} from "@/lib/document-uploads";
import { Modal, Empty } from "./workspace-primitives";

type Attachment = { id: string; filename: string; byteSize: number };
type Entry = {
  id: string;
  title: string;
  folderId: string;
  preview: string;
  body?: string;
  creatorId: string;
  documentDate: string | null;
  version: number;
  attachments: Attachment[];
  updatedAt: string;
};
const date = (value: string) =>
  new Date(
    value.length === 10 ? value + "T12:00:00Z" : value,
  ).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} מ״ב`
    : `${Math.ceil(bytes / 1024)} ק״ב`;
export default function DocumentLibrary({
  section,
  userId,
  role,
}: {
  section: DocumentSection;
  userId: string;
  role: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [folder, setFolder] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null),
    [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false),
    [files, setFiles] = useState<File[]>([]);
  const uploadCache=useRef<DocumentUploadCache>(new Map());
  const [uploadProgress,setUploadProgress]=useState("");
  const [folders,setFolders]=useState<DocumentFolder[]>([...documentFolders]);
  const [creatingFolder,setCreatingFolder]=useState(false);
  const requests = useRef(new Map<string, string>());
  const manager = ["deputy", "staff", "company_commander"].includes(role),
    canWrite = manager || role === "contributor";
  const rootName = section === "library" ? "ספרייה" : "סיכומי ישיבות וביקורות";
  const catalog = folders.filter((item) => item.section === section);
  const current = catalog.find((item) => item.id === folder);
  const visibleFolders = catalog.filter((item) => item.parent === folder);
  const included = new Set<string>(catalog.map((item) => item.id));
  const visibleEntries = entries.filter(
    (entry) =>
      included.has(entry.folderId) && entry.folderId !== "trackers" &&
      (query
        ? `${entry.title} ${entry.preview} ${entry.attachments.map((file) => file.filename).join(" ")}`.includes(
            query,
          )
        : entry.folderId === folder),
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/documents", { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "המסמכים אינם זמינים");
      setEntries(value.entries);
      setFolders(value.folders);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const openedLink = useRef("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("entry");
    const entry = entries.find(row => row.id === id);
    if (entry && openedLink.current !== id) {
      openedLink.current = id!;
      setFolder(entry.folderId);
      void openEntry(entry);
    }
  }, [entries]);
  function openFolder(id: string | null) {
    setFolder(id);
    setQuery("");
    setNotice("");
  }
  async function openEntry(entry: Entry) {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/api/documents/${entry.id}`, {
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "המסמך אינו זמין");
      setSelected(value.entry);
      setEditing(false);
      setFiles([]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "שגיאה בטעינה");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const attachments=await prepareDocumentFiles(files,uploadCache.current,setUploadProgress);
      const body = {
        title: String(form.get("title")),
        body: String(form.get("body") || ""),
        folderId: String(form.get("folderId")),
        documentDate: form.get("documentDate") || null,
        attachments,
        ...(selected ? { version: selected.version } : {}),
      };
      const key = JSON.stringify(body);
      if (!selected && !requests.current.has(key))
        requests.current.set(key, crypto.randomUUID());
      const response = await apiFetch(
        selected ? `/api/documents/${selected.id}` : "/api/documents",
        {
          method: selected ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            selected
              ? body
              : { ...body, clientRequestId: requests.current.get(key) },
          ),
        },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "המסמך לא נשמר");
      requests.current.delete(key);
      uploadCache.current.clear();
      window.dispatchEvent(new Event("samgad:saved"));
      setSelected(null);
      setCreating(false);
      setEditing(false);
      setFiles([]);
      setFolder(body.folderId);
      setQuery("");
      await load();
      setNotice("המסמך נשמר בתיקייה");
    } catch (error) {
      setError(error instanceof Error ? error.message : "המסמך לא נשמר");
    } finally {
      setBusy(false);setUploadProgress("");
    }
  }
  const modalOpen = creating || Boolean(selected);
  const editForm = creating || editing;
  if (section === "library" && folder === "trackers") return <TrackingTables userId={userId} role={role} back={() => {openFolder(null);void load();}} />;
  return (
    <div className="document-workspace">
      {creatingFolder && <Modal title="הוספת תיקייה" close={()=>setCreatingFolder(false)}><form onSubmit={async event=>{
        event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('');
        try{const response=await apiFetch('/api/documents/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.get('name'),parent:form.get('parent')||null,section,clientRequestId:crypto.randomUUID()})});const result=await response.json();if(!response.ok)throw Error(result.error||'לא ניתן ליצור תיקייה');await load();setCreatingFolder(false);openFolder(result.folder.id);setNotice('התיקייה נוספה');window.dispatchEvent(new Event('samgad:saved'));}catch(error){setError(error instanceof Error?error.message:'לא ניתן ליצור תיקייה');}finally{setBusy(false);}
      }}><label>שם התיקייה<input name="name" required maxLength={120}/></label><label>בתוך תיקייה<select name="parent" defaultValue={folder||''}><option value="">{rootName} — תיקייה ראשית</option>{catalog.filter(item=>item.id!=='trackers').map(item=><option key={item.id} value={item.id}>{folderPath(item.id,folders)}</option>)}</select></label><button className="button primary" disabled={busy}>{busy?'שומר…':'יצירת תיקייה'}</button>{error&&<p role="alert">{error}</p>}</form></Modal>}

      <div className="document-breadcrumbs">
        <button onClick={() => openFolder(null)}>{rootName}</button>
        {current?.parent && (
          <>
            <ChevronLeft size={15} />
            <button onClick={() => openFolder(current.parent)}>
              {catalog.find((item) => item.id === current.parent)?.name}
            </button>
          </>
        )}
        {current && (
          <>
            <ChevronLeft size={15} />
            <strong>{current.name}</strong>
          </>
        )}
      </div>
      <div className="document-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={`חיפוש ב${rootName}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש במסמכים ובקבצים"
          />
        </label>
        {manager && <button className="button secondary" onClick={()=>setCreatingFolder(true)}><Folder size={17}/>הוספת תיקייה</button>}
        {canWrite && (
          <button
            className="button primary"
            onClick={() => {
              setCreating(true);
              setSelected(null);
              setFiles([]);
            }}
          >
            <Plus size={17} />
            {section === "records" ? "הוספת סיכום" : "הוספת מסמך / קובץ"}
          </button>
        )}
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rhythm-notice" role="status">
          {notice}
        </p>
      )}
      {!query && (
        <div className="document-folder-grid">
          {visibleFolders.map((item) => {
            const children = descendants(item.id,folders),
              count = entries.filter((entry) =>
                children.includes(entry.folderId),
              ).length;
            return (
              <button
                className="document-folder-card"
                key={item.id}
                onClick={() => openFolder(item.id)}
              >
                <Folder size={40} />
                <strong>{item.name}</strong>
                <span>{count === 1 ? "פריט אחד" : `${count} פריטים`}</span>
                {catalog.some((folder) => folder.parent === item.id) && (
                  <small>
                    {
                      catalog.filter((folder) => folder.parent === item.id)
                        .length
                    }{" "}
                    תיקיות משנה
                  </small>
                )}
              </button>
            );
          })}
        </div>
      )}
      {current && !query && (
        <button
          className="button secondary document-back"
          onClick={() => openFolder(current.parent)}
        >
          <ArrowRight size={16} />
          חזרה
        </button>
      )}
      <div className="document-entry-list" aria-busy={loading}>
        {visibleEntries.map((entry) => (
          <button
            className="panel document-entry"
            key={entry.id}
            onClick={() => void openEntry(entry)}
            disabled={busy}
          >
            <FileText size={26} />
            <div>
              <strong>{entry.title}</strong>
              {query && <small>{folderPath(entry.folderId,folders)}</small>}
              {entry.preview && <p>{entry.preview}</p>}
              <small>
                {entry.documentDate
                  ? `תאריך: ${date(entry.documentDate)}`
                  : `עודכן: ${date(entry.updatedAt)}`}{" "}
                · {entry.attachments.length} קבצים
              </small>
            </div>
            <ChevronLeft size={18} />
          </button>
        ))}
      </div>
      {!loading &&
        visibleEntries.length === 0 &&
        (query || (current && visibleFolders.length === 0)) && (
          <Empty>
            {query
              ? "לא נמצאו מסמכים התואמים לחיפוש."
              : "התיקייה ריקה. אפשר להוסיף קובץ או סיכום בטקסט."}
          </Empty>
        )}
      {loading && <p role="status">טוענים את המסמכים…</p>}
      {modalOpen && (
        <Modal
          wide
          title={
            editForm
              ? creating
                ? section === "records"
                  ? "הוספת סיכום ישיבה / ביקורת"
                  : "הוספת מסמך לספרייה"
                : "עריכת מסמך"
              : selected!.title
          }
          close={() => {
            setCreating(false);
            setSelected(null);
            setEditing(false);
            setFiles([]);
          }}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {editForm ? (
            <form onSubmit={save}>
              <label>
                כותרת
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={selected?.title}
                />
              </label>
              <div className="form-grid">
                <label>
                  תיקייה
                  <select
                    name="folderId"
                    required
                    defaultValue={selected?.folderId || folder || ""}
                  >
                    <option value="" disabled>
                      בחירת תיקייה
                    </option>
                    {catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {folderPath(item.id,folders)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  תאריך הישיבה / הביקורת / המסמך
                  <input
                    type="date"
                    name="documentDate"
                    defaultValue={selected?.documentDate || ""}
                  />
                </label>
              </div>
              <label>
                טקסט / סיכום
                <textarea
                  name="body"
                  rows={10}
                  maxLength={100000}
                  defaultValue={selected?.body || ""}
                  placeholder="אפשר להדביק כאן את סיכום הישיבה או הביקורת"
                />
              </label>
              <label className="document-upload">
                <Upload size={19} />
                הוספת קבצים
                <input
                  type="file"
                  disabled={busy}
                  multiple
                  accept={Object.keys(documentExtensions)
                    .map((extension) => `.${extension}`)
                    .join(",")}
                  onChange={(event) => {
                    const selected = Array.from(event.target.files || []);
                    try {validateDocumentFiles(selected);setError("");setFiles(selected);uploadCache.current.clear();}
                    catch(error){setError(error instanceof Error?error.message:"הקבצים אינם תקינים");event.target.value="";setFiles([]);uploadCache.current.clear();}
                  }}
                />
                <small>
                  PDF, מסמכי Office, טקסט ותמונות. עד 25 מ״ב לקובץ, עד 5 קבצים ועד 100 מ״ב בכל שמירה.
                </small>
              </label>
              {files.map((file) => (
                <p className="document-filename" key={file.name}>
                  {file.name} · {size(file.size)}
                </p>
              ))}
              {selected?.attachments.length ? (
                <p className="muted">
                  הקבצים הקיימים יישמרו:{" "}
                  {selected.attachments.map((file) => file.filename).join(", ")}
                </p>
              ) : null}
              {uploadProgress&&<p role="status" aria-live="polite">{uploadProgress}</p>}
              <div className="modal-actions">
                <button className="button primary" disabled={busy}>
                  {busy ? "שומר…" : "שמירה בתיקייה"}
                </button>
              </div>
            </form>
          ) : (
            selected && (
              <>
                <p className="document-detail-meta">
                  {folderPath(selected.folderId,folders)}
                  {selected.documentDate && (
                    <>
                      {" "}
                      · <CalendarDays size={14} /> {date(selected.documentDate)}
                    </>
                  )}
                </p>
                {selected.body && (
                  <div className="document-body">{selected.body}</div>
                )}
                <div className="document-attachments">
                  {selected.attachments.map((file) => (
                    <a
                      className="button secondary"
                      key={file.id}
                      href={`/api/documents/files/${file.id}`}
                      download
                    >
                      <Download size={17} />
                      <span>
                        {file.filename}
                        <small>{size(file.byteSize)}</small>
                      </span>
                    </a>
                  ))}
                </div>
                {canWrite && (manager || selected.creatorId === userId) && (
                  <div className="modal-actions">
                    <button
                      className="button primary"
                      onClick={() => {
                        setEditing(true);
                        setFiles([]);
                      }}
                    >
                      עריכת סיכום / מסמך
                    </button>
                  </div>
                )}
              </>
            )
          )}
        </Modal>
      )}
    </div>
  );
}
