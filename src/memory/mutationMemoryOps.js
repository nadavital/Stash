import crypto from "node:crypto";

function normalizeNoteComments(rawComments = []) {
  return (Array.isArray(rawComments) ? rawComments : [])
    .map((entry) => ({
      id: String(entry?.id || "").trim(),
      text: String(entry?.text || "").trim(),
      createdAt: String(entry?.createdAt || "").trim(),
      authorUserId: String(entry?.authorUserId || "").trim() || null,
    }))
    .filter((entry) => entry.text);
}

export function createMemoryMutationOps({
  resolveActor,
  normalizeSourceType,
  inferEntityTitleFromUrl,
  resolveCanonicalProjectName,
  parseGenericDataUrl,
  inferMimeFromFileName,
  maybeDecodeTextUpload,
  saveImageDataUrl,
  mimeToExt,
  deriveMemoryTitle,
  heuristicSummary,
  heuristicTags,
  noteRepo,
  versionRepo,
  enrichmentJobRepo,
  enrichmentQueue,
  noteOwnerId,
  enqueueEnrichmentJob,
  buildEnrichmentJobParamsFromNote,
  emitNoteActivity,
  emitWorkspaceActivity,
  updateConsolidatedMemoryFile,
  cleanupReplacedImageArtifact,
  cleanupDeletedNotesArtifacts,
  assertCanMutateNote,
  assertCanReadNote,
  buildFolderAccessContext,
  canMutateNote,
  authorizationError,
  normalizeBaseRevision,
  nowIso,
  assertWorkspaceManager,
  clampInt,
}) {
  async function createMemory({
    content = "",
    title = "",
    sourceType = "text",
    sourceUrl = "",
    imageDataUrl = null,
    fileDataUrl = null,
    fileName = "",
    fileMimeType = "",
    project = "",
    metadata = {},
    actor = null,
  }) {
    const actorContext = resolveActor(actor);
    const requestedSourceType = normalizeSourceType(sourceType);
    const requestedProject = String(project || "").trim();
    const canonicalRequestedProject = await resolveCanonicalProjectName(requestedProject, actorContext.workspaceId);
    const normalizedSourceUrl = String(sourceUrl || "").trim();
    let normalizedContent = String(content || "").trim();
    const normalizedFileDataUrl = String(fileDataUrl || imageDataUrl || "").trim() || null;
    const normalizedFileName = String(fileName || "").trim();
    const normalizedFileMimeType = String(fileMimeType || "").trim().toLowerCase();
    const explicitTitle = String(title || metadata?.title || "").trim();

    let uploadMime = normalizedFileMimeType || null;
    let uploadSize = null;
    if (normalizedFileDataUrl) {
      const parsedData = parseGenericDataUrl(normalizedFileDataUrl);
      uploadMime = uploadMime || parsedData.mime;
      uploadSize = parsedData.bytes.length;
    }
    if (!uploadMime || uploadMime === "application/octet-stream") {
      const inferred = inferMimeFromFileName(normalizedFileName);
      if (inferred) {
        uploadMime = inferred;
      }
    }

    const normalizedSourceType =
      normalizedFileDataUrl && uploadMime
        ? uploadMime.startsWith("image/")
          ? "image"
          : "file"
        : requestedSourceType;

    if (!normalizedContent && normalizedSourceUrl) {
      normalizedContent = normalizedSourceUrl;
    }

    let imageData = null;
    if (normalizedFileDataUrl && uploadMime?.startsWith("image/")) {
      imageData = await saveImageDataUrl(normalizedFileDataUrl);
    }

    let rawContent = null;
    let markdownContent = null;
    let uploadEnrichment = null;
    let uploadParsingError = "";
    if (normalizedFileDataUrl) {
      if (!rawContent && !markdownContent) {
        const textExtract = maybeDecodeTextUpload(normalizedFileDataUrl, uploadMime, normalizedFileName);
        if (textExtract) {
          rawContent = textExtract;
          markdownContent = textExtract;
        }
      }
    }

    if (!normalizedContent && markdownContent) {
      normalizedContent = markdownContent.slice(0, 12000).trim();
    }
    if (!normalizedContent && rawContent) {
      normalizedContent = rawContent.slice(0, 12000).trim();
    }
    if (!normalizedContent && normalizedFileDataUrl) {
      normalizedContent = normalizedFileName ? `Uploaded file: ${normalizedFileName}` : "Uploaded file";
    }

    if (!normalizedContent && !normalizedFileDataUrl && !imageData) {
      throw new Error("Missing content");
    }

    let linkTitle = "";
    if (normalizedSourceType === "link" && normalizedSourceUrl) {
      linkTitle = inferEntityTitleFromUrl(normalizedSourceUrl) || "Saved link";
      normalizedContent = normalizedSourceUrl;
    }

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const seedTags = heuristicTags(`${normalizedContent} ${normalizedSourceUrl}`);
    const derivedTitle = deriveMemoryTitle({
      explicitTitle,
      sourceType: normalizedSourceType,
      content: normalizedContent,
      markdownContent,
      rawContent,
      fileName: normalizedFileName,
    });
    const note = await noteRepo.createNote({
      id,
      workspaceId: actorContext.workspaceId,
      ownerUserId: actorContext.userId,
      createdByUserId: actorContext.userId,
      content: normalizedContent,
      sourceType: normalizedSourceType,
      sourceUrl: normalizedSourceUrl || null,
      imagePath: imageData?.imagePath || null,
      fileName: normalizedFileName || null,
      fileMime: uploadMime || null,
      fileSize: uploadSize,
      rawContent,
      markdownContent,
      summary: heuristicSummary(normalizedContent),
      tags: seedTags,
      project: canonicalRequestedProject || null,
      createdAt,
      updatedAt: createdAt,
      embedding: null,
      metadata: {
        ...metadata,
        title: derivedTitle || linkTitle || null,
        imageMime: imageData?.imageMime || null,
        imageSize: imageData?.imageSize || null,
        fileMime: uploadMime || null,
        fileSize: uploadSize,
        uploadParsingError: uploadParsingError || null,
        linkTitle: linkTitle || null,
      },
      status: "pending",
    });

    await enqueueEnrichmentJob({
      noteId: note.id,
      workspaceId: actorContext.workspaceId,
      visibilityUserId: actorContext.userId,
      requestedProject: canonicalRequestedProject,
      normalizedSourceType,
      normalizedSourceUrl,
      hasFileUpload: Boolean(normalizedFileDataUrl),
      uploadEnrichment,
      fileDataUrl: normalizedFileDataUrl,
      fileName: normalizedFileName,
      fileMime: uploadMime,
    });

    await emitNoteActivity({
      actorContext,
      note,
      eventType: "note.created",
      details: {
        sourceType: note.sourceType || normalizedSourceType,
      },
    });

    return note;
  }

  async function updateMemory({ id, content, summary, title, tags, project, baseRevision = null, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");
    const normalizedBaseRevision = normalizeBaseRevision(baseRevision);

    const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanMutateNote(existing, actorContext);

    const resolvedProject =
      project !== undefined
        ? await resolveCanonicalProjectName(String(project), actorContext.workspaceId)
        : String(existing.project || "");
    const existingProject = String(existing.project || "");
    const existingTitle = String(existing?.metadata?.title || "").trim();
    const normalizedTitle = title !== undefined ? String(title || "").trim().slice(0, 180) : undefined;

    const changes = [];
    if (content !== undefined && String(content) !== existing.content) changes.push("content");
    if (summary !== undefined && String(summary) !== existing.summary) changes.push("summary");
    if (title !== undefined && normalizedTitle !== existingTitle) changes.push("title");
    if (tags !== undefined && JSON.stringify(tags) !== JSON.stringify(existing.tags)) changes.push("tags");
    if (project !== undefined && resolvedProject !== existingProject) changes.push("project");

    if (changes.length > 0) {
      await versionRepo.createSnapshot({
        noteId: normalizedId,
        workspaceId: actorContext.workspaceId,
        content: existing.content,
        summary: existing.summary,
        tags: existing.tags,
        project: existing.project,
        metadata: existing.metadata,
        actorUserId: actorContext.userId,
        changeSummary: `Edited: ${changes.join(", ")}`,
      });
    }

    const newContent = content !== undefined ? String(content) : existing.content;
    const contentChanged = content !== undefined && newContent !== existing.content;
    const nextMetadata = title !== undefined
      ? {
          ...(existing.metadata || {}),
          title: normalizedTitle || null,
        }
      : existing.metadata;

    const updatedNote = await noteRepo.updateNote({
      id: normalizedId,
      content: newContent,
      summary: summary !== undefined ? String(summary) : existing.summary,
      tags: tags !== undefined ? tags : existing.tags,
      project: project !== undefined ? resolvedProject : existingProject,
      metadata: nextMetadata,
      workspaceId: actorContext.workspaceId,
      baseRevision: normalizedBaseRevision,
    });
    if (!updatedNote) {
      throw new Error(`Memory not found: ${normalizedId}`);
    }

    if (contentChanged) {
      await noteRepo.updateStatus(normalizedId, "pending", actorContext.workspaceId);
      await enqueueEnrichmentJob({
        noteId: normalizedId,
        workspaceId: actorContext.workspaceId,
        visibilityUserId: noteOwnerId(existing) || actorContext.userId,
        requestedProject: updatedNote.project || "",
        normalizedSourceType: updatedNote.sourceType || "text",
        normalizedSourceUrl: updatedNote.sourceUrl || "",
        hasFileUpload: false,
        uploadEnrichment: null,
        fileDataUrl: null,
        fileName: updatedNote.fileName || "",
        fileMime: updatedNote.fileMime || "",
      });
    } else {
      await updateConsolidatedMemoryFile(updatedNote, actorContext.workspaceId);
    }

    await emitNoteActivity({
      actorContext,
      note: updatedNote,
      eventType: "note.updated",
      details: {
        changed: changes,
      },
    });

    return updatedNote;
  }

  async function updateMemoryAttachment({
    id,
    content,
    fileDataUrl = null,
    imageDataUrl = null,
    fileName = "",
    fileMimeType = "",
    baseRevision = null,
    actor = null,
    requeueEnrichment = true,
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");
    const normalizedBaseRevision = normalizeBaseRevision(baseRevision);

    const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanMutateNote(existing, actorContext);

    const normalizedFileDataUrl = String(fileDataUrl || imageDataUrl || "").trim() || null;
    if (!normalizedFileDataUrl) {
      throw new Error("Missing attachment payload");
    }

    const normalizedFileName = String(fileName || "").trim();
    const normalizedFileMimeType = String(fileMimeType || "").trim().toLowerCase();
    const parsedUpload = parseGenericDataUrl(normalizedFileDataUrl);
    let uploadMime = normalizedFileMimeType || parsedUpload.mime;
    if (!uploadMime || uploadMime === "application/octet-stream") {
      const inferred = inferMimeFromFileName(normalizedFileName);
      if (inferred) uploadMime = inferred;
    }
    const sourceType = uploadMime?.startsWith("image/") ? "image" : "file";
    const uploadSize = parsedUpload.bytes.length;
    const nextFileName =
      normalizedFileName ||
      existing.fileName ||
      (sourceType === "image" ? `image.${mimeToExt(uploadMime || "image/png")}` : "upload.bin");

    let nextImageData = null;
    if (sourceType === "image") {
      nextImageData = await saveImageDataUrl(normalizedFileDataUrl);
    }

    const extractedText = maybeDecodeTextUpload(normalizedFileDataUrl, uploadMime, normalizedFileName);
    const rawContent = extractedText || null;
    const markdownContent = extractedText || null;
    const nextContent = content !== undefined
      ? String(content || "")
      : String(existing.content || "").trim() || (normalizedFileName ? `Uploaded file: ${normalizedFileName}` : "Uploaded file");

    await versionRepo.createSnapshot({
      noteId: normalizedId,
      workspaceId: actorContext.workspaceId,
      content: existing.content,
      summary: existing.summary,
      tags: existing.tags,
      project: existing.project,
      metadata: existing.metadata,
      actorUserId: actorContext.userId,
      changeSummary: "Edited attachment",
    });

    const updatedNote = await noteRepo.updateAttachment({
      id: normalizedId,
      content: nextContent,
      sourceType,
      sourceUrl: null,
      imagePath: nextImageData?.imagePath || null,
      fileName: nextFileName,
      fileMime: uploadMime || existing.fileMime || null,
      fileSize: uploadSize,
      rawContent,
      markdownContent,
      metadata: {
        ...(existing.metadata || {}),
        imageMime: nextImageData?.imageMime || null,
        imageSize: nextImageData?.imageSize || null,
        fileMime: uploadMime || null,
        fileSize: uploadSize,
        attachmentUpdatedAt: nowIso(),
        attachmentUpdatedBy: actorContext.userId,
      },
      updatedAt: nowIso(),
      workspaceId: actorContext.workspaceId,
      baseRevision: normalizedBaseRevision,
    });
    if (!updatedNote) {
      throw new Error(`Memory not found: ${normalizedId}`);
    }

    await cleanupReplacedImageArtifact(existing.imagePath, updatedNote.imagePath);

    if (requeueEnrichment) {
      await noteRepo.updateStatus(normalizedId, "pending", actorContext.workspaceId);
      await enqueueEnrichmentJob({
        noteId: normalizedId,
        workspaceId: actorContext.workspaceId,
        visibilityUserId: noteOwnerId(existing) || actorContext.userId,
        requestedProject: updatedNote.project || "",
        normalizedSourceType: updatedNote.sourceType || sourceType,
        normalizedSourceUrl: updatedNote.sourceUrl || "",
        hasFileUpload: true,
        uploadEnrichment: null,
        fileDataUrl: normalizedFileDataUrl,
        fileName: updatedNote.fileName || nextFileName,
        fileMime: updatedNote.fileMime || uploadMime,
      });
      const queued = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
      await emitNoteActivity({
        actorContext,
        note: queued || updatedNote,
        eventType: "note.updated",
        details: {
          changed: ["attachment"],
          sourceType: sourceType,
          requeueEnrichment: true,
        },
      });
      return queued;
    }

    await updateConsolidatedMemoryFile(updatedNote, actorContext.workspaceId);
    await emitNoteActivity({
      actorContext,
      note: updatedNote,
      eventType: "note.updated",
      details: {
        changed: ["attachment"],
        sourceType: sourceType,
        requeueEnrichment: false,
      },
    });
    return updatedNote;
  }

  async function updateMemoryExtractedContent({
    id,
    title,
    content,
    rawContent,
    markdownContent,
    baseRevision = null,
    actor = null,
    requeueEnrichment = true,
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");
    const normalizedBaseRevision = normalizeBaseRevision(baseRevision);

    const hasTitle = title !== undefined;
    const hasContent = content !== undefined;
    const hasRawContent = rawContent !== undefined;
    const hasMarkdownContent = markdownContent !== undefined;
    if (!hasTitle && !hasContent && !hasRawContent && !hasMarkdownContent) {
      throw new Error("Nothing to update");
    }

    const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanMutateNote(existing, actorContext);

    const normalizedContent = hasContent ? String(content || "") : String(existing.content || "");
    const normalizedTitle = hasTitle ? String(title || "").trim().slice(0, 180) : undefined;
    const normalizedRawContent = hasRawContent
      ? (rawContent === null ? null : String(rawContent))
      : undefined;
    const normalizedMarkdownContent = hasMarkdownContent
      ? (markdownContent === null ? null : String(markdownContent))
      : undefined;

    const titleChanged = hasTitle && normalizedTitle !== String(existing?.metadata?.title || "").trim();
    const contentChanged = hasContent && normalizedContent !== String(existing.content || "");
    const rawChanged = hasRawContent && String(normalizedRawContent ?? "") !== String(existing.rawContent ?? "");
    const markdownChanged =
      hasMarkdownContent && String(normalizedMarkdownContent ?? "") !== String(existing.markdownContent ?? "");

    if (titleChanged || contentChanged || rawChanged || markdownChanged) {
      await versionRepo.createSnapshot({
        noteId: normalizedId,
        workspaceId: actorContext.workspaceId,
        content: existing.content,
        summary: existing.summary,
        tags: existing.tags,
        project: existing.project,
        metadata: existing.metadata,
        actorUserId: actorContext.userId,
        changeSummary: "Edited extracted content",
      });
    }

    const noteAfterExtract = await noteRepo.updateExtractedContent({
      id: normalizedId,
      content: normalizedContent,
      summary: existing.summary || "",
      tags: Array.isArray(existing.tags) ? existing.tags : [],
      project: existing.project || "General",
      metadata: {
        ...(existing.metadata || {}),
        ...(hasTitle ? { title: normalizedTitle || null } : {}),
        extractedContentEditedAt: nowIso(),
        extractedContentEditedBy: actorContext.userId,
      },
      rawContent: hasRawContent ? normalizedRawContent : undefined,
      markdownContent: hasMarkdownContent ? normalizedMarkdownContent : undefined,
      updatedAt: nowIso(),
      workspaceId: actorContext.workspaceId,
      baseRevision: normalizedBaseRevision,
    });
    if (!noteAfterExtract) {
      throw new Error(`Memory not found: ${normalizedId}`);
    }

    const changedKeys = [];
    if (titleChanged) changedKeys.push("title");
    if (contentChanged || rawChanged || markdownChanged) changedKeys.push("extracted_content");

    if (requeueEnrichment && (contentChanged || rawChanged || markdownChanged)) {
      await noteRepo.updateStatus(normalizedId, "pending", actorContext.workspaceId);
      await enqueueEnrichmentJob({
        noteId: normalizedId,
        workspaceId: actorContext.workspaceId,
        visibilityUserId: noteOwnerId(existing) || actorContext.userId,
        requestedProject: noteAfterExtract.project || "",
        normalizedSourceType: noteAfterExtract.sourceType || "text",
        normalizedSourceUrl: noteAfterExtract.sourceUrl || "",
        hasFileUpload: false,
        uploadEnrichment: null,
        fileDataUrl: null,
        fileName: noteAfterExtract.fileName || "",
        fileMime: noteAfterExtract.fileMime || "",
      });
      const queued = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
      await emitNoteActivity({
        actorContext,
        note: queued || noteAfterExtract,
        eventType: "note.updated",
        details: {
          changed: changedKeys.length ? changedKeys : ["extracted_content"],
          requeueEnrichment: true,
        },
      });
      return queued;
    }

    await updateConsolidatedMemoryFile(noteAfterExtract, actorContext.workspaceId);
    await emitNoteActivity({
      actorContext,
      note: noteAfterExtract,
      eventType: "note.updated",
      details: {
        changed: changedKeys.length ? changedKeys : ["extracted_content"],
        requeueEnrichment: false,
      },
    });
    return noteAfterExtract;
  }

  async function listMemoryVersions({ id, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");

    const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanReadNote(existing, actorContext);

    const items = await versionRepo.listVersions(normalizedId, actorContext.workspaceId);
    return { items, count: items.length };
  }

  async function restoreMemoryVersion({ id, versionNumber, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");

    const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanMutateNote(existing, actorContext);

    const version = await versionRepo.getVersion(normalizedId, versionNumber, actorContext.workspaceId);
    if (!version) throw new Error(`Version ${versionNumber} not found`);

    await versionRepo.createSnapshot({
      noteId: normalizedId,
      workspaceId: actorContext.workspaceId,
      content: existing.content,
      summary: existing.summary,
      tags: existing.tags,
      project: existing.project,
      metadata: existing.metadata,
      actorUserId: actorContext.userId,
      changeSummary: `Restored from version ${versionNumber}`,
    });

    const contentChanged = version.content !== existing.content;

    const updatedNote = await noteRepo.updateNote({
      id: normalizedId,
      content: version.content || "",
      summary: version.summary || "",
      tags: version.tags || [],
      project: version.project || "",
      workspaceId: actorContext.workspaceId,
    });

    if (contentChanged) {
      await noteRepo.updateStatus(normalizedId, "pending", actorContext.workspaceId);
      await enqueueEnrichmentJob({
        noteId: normalizedId,
        workspaceId: actorContext.workspaceId,
        visibilityUserId: noteOwnerId(existing) || actorContext.userId,
        requestedProject: updatedNote.project || "",
        normalizedSourceType: updatedNote.sourceType || "text",
        normalizedSourceUrl: updatedNote.sourceUrl || "",
        hasFileUpload: false,
        uploadEnrichment: null,
        fileDataUrl: null,
        fileName: updatedNote.fileName || "",
        fileMime: updatedNote.fileMime || "",
      });
    } else {
      await updateConsolidatedMemoryFile(updatedNote, actorContext.workspaceId);
    }

    await emitNoteActivity({
      actorContext,
      note: updatedNote,
      eventType: "note.version_restored",
      details: {
        versionNumber,
      },
    });

    return updatedNote;
  }

  async function retryMemoryEnrichment({ id, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");

    const note = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!note) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanMutateNote(note, actorContext);

    if (await enrichmentJobRepo.hasInFlightJobForNote({
      workspaceId: actorContext.workspaceId,
      noteId: normalizedId,
    })) {
      const updated = await noteRepo.updateStatus(normalizedId, "pending", actorContext.workspaceId);
      await emitNoteActivity({
        actorContext,
        note: updated || note,
        eventType: "note.enrichment_retry",
        details: {
          source: "existing_inflight",
        },
      });
      return {
        note: updated,
        queued: false,
        source: "existing_inflight",
      };
    }

    const visibilityUserId = noteOwnerId(note) || actorContext.userId;
    const retriedJob = await enrichmentJobRepo.retryFailedJobForNote({
      workspaceId: actorContext.workspaceId,
      noteId: normalizedId,
      visibilityUserId,
    });

    await noteRepo.updateStatus(normalizedId, "pending", actorContext.workspaceId);
    if (retriedJob) {
      enrichmentQueue.kick();
      await enrichmentQueue.refreshCounts().catch(() => {});
      const refreshedNote = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
      await emitNoteActivity({
        actorContext,
        note: refreshedNote || note,
        eventType: "note.enrichment_retry",
        details: {
          source: "failed_job_requeued",
        },
      });
      return {
        note: refreshedNote,
        queued: true,
        source: "failed_job_requeued",
        jobId: retriedJob.id,
      };
    }

    const enqueued = await enqueueEnrichmentJob(
      buildEnrichmentJobParamsFromNote(note, {
        workspaceId: actorContext.workspaceId,
        visibilityUserId,
      }),
      { throwOnError: true }
    );
    if (!enqueued) {
      throw new Error("Failed to queue enrichment retry");
    }
    const refreshedNote = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    await emitNoteActivity({
      actorContext,
      note: refreshedNote || note,
      eventType: "note.enrichment_retry",
      details: {
        source: "new_job_enqueued",
      },
    });
    return {
      note: refreshedNote,
      queued: true,
      source: "new_job_enqueued",
    };
  }

  async function getEnrichmentQueueStats({ actor = null, failedLimit = 20 } = {}) {
    const actorContext = resolveActor(actor);
    assertWorkspaceManager(actorContext);

    const counts = await enrichmentJobRepo.getQueueCounts({
      workspaceId: actorContext.workspaceId,
    });
    const failedJobs = await enrichmentJobRepo.listFailedJobs({
      workspaceId: actorContext.workspaceId,
      limit: clampInt(failedLimit, 1, 100, 20),
    });
    return {
      counts,
      failedJobs: failedJobs.map((job) => ({
        id: job.id,
        type: job.type,
        workspaceId: job.workspaceId,
        noteId: String(job.payload?.noteId || "").trim(),
        visibilityUserId: job.visibilityUserId || null,
        status: job.status,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        lastError: job.lastError || "",
        updatedAt: job.updatedAt,
        createdAt: job.createdAt,
      })),
    };
  }

  async function addMemoryComment({ id, text, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");

    const normalizedText = String(text || "").trim();
    if (!normalizedText) throw new Error("Missing comment text");
    if (normalizedText.length > 2000) throw new Error("Comment is too long (max 2000 chars)");

    const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanReadNote(existing, actorContext);

    const comment = {
      id: crypto.randomUUID(),
      text: normalizedText,
      createdAt: nowIso(),
      authorUserId: actorContext.userId,
    };

    const existingComments = normalizeNoteComments(existing.metadata?.comments);
    const nextComments = [...existingComments, comment].slice(-200);
    const nextMetadata = {
      ...(existing.metadata || {}),
      comments: nextComments,
    };

    const updatedNote = await noteRepo.updateEnrichment({
      id: normalizedId,
      summary: existing.summary || "",
      tags: Array.isArray(existing.tags) ? existing.tags : [],
      project: existing.project || "General",
      embedding: existing.embedding || null,
      metadata: nextMetadata,
      updatedAt: nowIso(),
      workspaceId: actorContext.workspaceId,
    });

    await updateConsolidatedMemoryFile(updatedNote, actorContext.workspaceId);
    await emitNoteActivity({
      actorContext,
      note: updatedNote,
      eventType: "note.comment_added",
      details: {
        commentId: comment.id,
        commentPreview: normalizedText.slice(0, 120),
      },
    });
    return {
      note: updatedNote,
      comment,
    };
  }

  async function deleteMemory({ id, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing id");
    }

    const note = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!note) {
      return {
        id: normalizedId,
        deleted: false,
      };
    }

    await assertCanMutateNote(note, actorContext);
    await noteRepo.deleteNote(normalizedId, actorContext.workspaceId);
    await cleanupDeletedNotesArtifacts([note], actorContext.workspaceId);
    await emitNoteActivity({
      actorContext,
      note,
      eventType: "note.deleted",
    });
    return {
      id: normalizedId,
      deleted: true,
    };
  }

  async function deleteProjectMemories({ project, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    assertWorkspaceManager(actorContext);
    const normalizedProject = String(project || "").trim();
    if (!normalizedProject) {
      throw new Error("Missing project");
    }

    const notes = await noteRepo.listByExactProject(normalizedProject, actorContext.workspaceId);
    if (!notes.length) {
      return {
        project: normalizedProject,
        deletedCount: 0,
        deletedIds: [],
      };
    }

    const deletedCount = await noteRepo.deleteByProject(normalizedProject, actorContext.workspaceId);
    await cleanupDeletedNotesArtifacts(notes, actorContext.workspaceId);
    return {
      project: normalizedProject,
      deletedCount,
      deletedIds: notes.map((note) => note.id),
    };
  }

  async function batchDeleteMemories({ ids, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedIds = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
    if (!normalizedIds.length) return { deleted: 0 };

    const notes = (await Promise.all(
      normalizedIds.map((id) => noteRepo.getNoteById(id, actorContext.workspaceId))
    )).filter(Boolean);

    const accessContext = await buildFolderAccessContext(actorContext);
    for (const note of notes) {
      if (!canMutateNote(note, actorContext, accessContext)) {
        throw authorizationError("Forbidden: you do not have permission to modify one or more selected items");
      }
    }

    const deleted = await noteRepo.batchDelete(normalizedIds, actorContext.workspaceId);
    await cleanupDeletedNotesArtifacts(notes, actorContext.workspaceId);
    return { deleted };
  }

  async function batchMoveMemories({ ids, project = "", actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedIds = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
    if (!normalizedIds.length) return { moved: 0 };
    const targetProject = await resolveCanonicalProjectName(String(project || ""), actorContext.workspaceId);

    const notes = (await Promise.all(
      normalizedIds.map((id) => noteRepo.getNoteById(id, actorContext.workspaceId))
    )).filter(Boolean);

    const accessContext = await buildFolderAccessContext(actorContext);
    for (const note of notes) {
      if (!canMutateNote(note, actorContext, accessContext)) {
        throw authorizationError("Forbidden: you do not have permission to modify one or more selected items");
      }
    }

    const moved = await noteRepo.batchMove(normalizedIds, targetProject, actorContext.workspaceId);
    if (moved > 0) {
      await emitWorkspaceActivity({
        actorContext,
        eventType: "note.updated",
        entityType: "workspace",
        details: {
          movedCount: moved,
          targetProject,
        },
      });
    }
    return { moved };
  }

  async function getMemoryById({ id, actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");
    const note = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!note) throw new Error(`Memory not found: ${normalizedId}`);
    await assertCanReadNote(note, actorContext);
    return note;
  }

  return {
    createMemory,
    updateMemory,
    updateMemoryAttachment,
    updateMemoryExtractedContent,
    listMemoryVersions,
    restoreMemoryVersion,
    retryMemoryEnrichment,
    getEnrichmentQueueStats,
    addMemoryComment,
    deleteMemory,
    deleteProjectMemories,
    batchDeleteMemories,
    batchMoveMemories,
    getMemoryById,
  };
}
