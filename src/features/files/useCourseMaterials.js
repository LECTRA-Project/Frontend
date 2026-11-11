import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteMaterial,
  describeStorageError,
  isMaterialStorageAvailable,
  listMaterials,
  saveMaterial,
} from "../../services/materials/materialStorage.js";
import { materialTypeOf } from "../../services/materials/materialTypes.js";

/*
  The signed-in student's uploaded course materials.

  Files are saved in this browser (IndexedDB) and come back after a reload. If the
  browser does not allow that (e.g. some private windows), files are kept for this
  tab only and `persistent` is false, so the panel can say so.

  Each material: { id, name, type, size, addedAt, file, url, persisted }
    url  a temporary blob: URL for viewing or downloading the file
*/
export function useCourseMaterials(userKey) {
  const [materials, setMaterials] = useState([]);
  const [status, setStatus] = useState(isMaterialStorageAvailable() ? "loading" : "ready");
  const [persistent, setPersistent] = useState(isMaterialStorageAvailable());
  const [error, setError] = useState(null);

  // Free the blob: URLs when leaving the workspace.
  const materialsRef = useRef(materials);
  useEffect(() => {
    materialsRef.current = materials;
  }, [materials]);
  useEffect(() => () => materialsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  useEffect(() => {
    if (!isMaterialStorageAvailable()) return undefined;
    let cancelled = false;
    listMaterials(userKey).then(
      (records) => {
        if (cancelled) return;
        setMaterials(
          records.map(({ userKey: _owner, ...record }) => ({
            ...record,
            url: URL.createObjectURL(record.file),
            persisted: true,
          }))
        );
        setStatus("ready");
      },
      (loadError) => {
        if (cancelled) return;
        setPersistent(false);
        setStatus("ready");
        setError(`Saved materials could not be loaded (${describeStorageError(loadError)}). New files are kept for this tab only.`);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  /* Adds supported files. Returns the names of files that were rejected as unsupported. */
  const addFiles = useCallback(
    async (files) => {
      setError(null);
      const rejected = files.filter((file) => !materialTypeOf(file.name)).map((file) => file.name);
      const added = [];

      for (const file of files.filter((item) => materialTypeOf(item.name))) {
        const record = {
          id: crypto.randomUUID(),
          name: file.name,
          type: materialTypeOf(file.name),
          size: file.size,
          addedAt: new Date().toISOString(),
          file,
        };
        let persisted = false;
        if (persistent) {
          try {
            await saveMaterial({ ...record, userKey });
            persisted = true;
          } catch (saveError) {
            setError(`“${file.name}” could not be saved in this browser (${describeStorageError(saveError)}). It is available until you close this tab.`);
          }
        }
        added.push({ ...record, url: URL.createObjectURL(file), persisted });
      }

      if (added.length > 0) setMaterials((list) => [...list, ...added]);
      if (rejected.length > 0) setError(`Not added (unsupported file type): ${rejected.join(", ")}.`);
      return added;
    },
    [persistent, userKey]
  );

  const removeMaterial = useCallback(async (material) => {
    setError(null);
    if (material.persisted) {
      try {
        await deleteMaterial(material.id);
      } catch (deleteError) {
        setError(`“${material.name}” could not be removed (${describeStorageError(deleteError)}).`);
        return false;
      }
    }
    URL.revokeObjectURL(material.url);
    setMaterials((list) => list.filter((item) => item.id !== material.id));
    return true;
  }, []);

  return { materials, status, persistent, error, addFiles, removeMaterial, dismissError: () => setError(null) };
}
