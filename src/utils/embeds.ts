import { EmbedBuilder, type ThreadAutoArchiveDuration } from "discord.js";
import { renderProgressBar } from "./progressBar";
import { renderListOrAttachment } from "./chunker";
import type { PlanResult, ExecutionSummary } from "../services/types";
import { describeInvalidReason } from "../validation/rules";

const BRAND_COLOR = 0x5865f2;
const SUCCESS_COLOR = 0x57f287;
const WARN_COLOR = 0xfee75c;
const DANGER_COLOR = 0xed4245;

function formatArchive(minutes: ThreadAutoArchiveDuration): string {
  const map: Record<number, string> = {
    60: "1 hour",
    1440: "24 hours",
    4320: "3 days",
    10080: "7 days",
  };
  return map[minutes] ?? `${minutes} minutes`;
}

export function buildPreviewEmbed(params: {
  channelName: string;
  plan: PlanResult;
  autoArchiveMinutes: ThreadAutoArchiveDuration;
  visibility: "public" | "private";
  requiresTypedConfirmation: boolean;
}): { embed: EmbedBuilder; attachmentText?: string } {
  const { channelName, plan, autoArchiveMinutes, visibility } = params;

  const sample = renderListOrAttachment(
    plan.toCreate.map((e) => `✓ ${e.normalizedName}`),
    { inlineLimit: 15, maxInlineChars: 900 },
  );

  const embed = new EmbedBuilder()
    .setTitle("Thread Creation Preview")
    .setColor(BRAND_COLOR)
    .addFields(
      { name: "Channel", value: `#${channelName}`, inline: true },
      { name: "Visibility", value: visibility, inline: true },
      { name: "Auto-archive", value: formatArchive(autoArchiveMinutes), inline: true },
      { name: "Threads to create", value: String(plan.toCreate.length), inline: true },
      { name: "Already existing", value: String(plan.alreadyExisting.length), inline: true },
      { name: "Duplicates in input", value: String(plan.duplicatesInList.length), inline: true },
      { name: "Invalid entries", value: String(plan.invalidEntries.length), inline: true },
    );

  const attachmentSections: string[] = [];

  if (sample.mode === "inline") {
    embed.addFields({ name: "New threads", value: sample.text || "*(none)*" });
  } else {
    embed.addFields({
      name: "New threads",
      value: `${plan.toCreate.length} names — see attached file for the full list.`,
    });
    attachmentSections.push("=== New threads ===", sample.content, "");
  }

  if (plan.invalidEntries.length > 0) {
    const invalidLines = plan.invalidEntries.map(
      (e) => `• "${e.raw}" — ${describeInvalidReason(e.reason)}`,
    );
    const rendered = renderListOrAttachment(invalidLines, { inlineLimit: 10 });
    if (rendered.mode === "inline") {
      embed.addFields({ name: "Invalid entry details", value: rendered.text });
    } else {
      attachmentSections.push("=== Invalid entries ===", rendered.content, "");
    }
  }

  if (params.requiresTypedConfirmation) {
    embed.setFooter({
      text: "This is a large operation — you'll be asked to type CONFIRM to proceed.",
    });
  }

  return {
    embed,
    attachmentText: attachmentSections.length > 0 ? attachmentSections.join("\n") : undefined,
  };
}

export function buildProgressEmbed(params: {
  operationId: string;
  channelName: string;
  total: number;
  done: number;
  created: number;
  failed: number;
}): EmbedBuilder {
  const { operationId, channelName, total, done, created, failed } = params;
  const skipped = 0;
  return new EmbedBuilder()
    .setTitle("Creating threads...")
    .setColor(BRAND_COLOR)
    .setDescription(renderProgressBar(done, total))
    .addFields(
      { name: "Channel", value: `#${channelName}`, inline: true },
      { name: "Created", value: `${created}/${total}`, inline: true },
      { name: "Failed", value: String(failed), inline: true },
      { name: "Skipped", value: String(skipped), inline: true },
    )
    .setFooter({ text: `Operation ${operationId}` });
}

export function buildFinalReportEmbed(params: {
  operationId: string;
  channelName: string;
  totalRequested: number;
  summary: ExecutionSummary;
  skippedExisting: number;
  skippedDuplicates: number;
  skippedInvalid: number;
}): { embed: EmbedBuilder; attachmentText?: string } {
  const {
    operationId,
    channelName,
    totalRequested,
    summary,
    skippedExisting,
    skippedDuplicates,
    skippedInvalid,
  } = params;

  const totalSkipped = skippedExisting + skippedDuplicates + skippedInvalid;
  const hasFailures = summary.failedCount > 0;

  const embed = new EmbedBuilder()
    .setTitle("Thread Creation Complete")
    .setColor(hasFailures ? WARN_COLOR : SUCCESS_COLOR)
    .addFields(
      { name: "Operation ID", value: operationId, inline: true },
      { name: "Channel", value: `#${channelName}`, inline: true },
      { name: "Duration", value: `${(summary.durationMs / 1000).toFixed(1)}s`, inline: true },
      { name: "Total requested", value: String(totalRequested), inline: true },
      { name: "Created", value: String(summary.createdCount), inline: true },
      { name: "Skipped", value: String(totalSkipped), inline: true },
      { name: "Failed", value: String(summary.failedCount), inline: true },
    );

  const lines: string[] = [];

  const createdLines = summary.created.map((r) => `✓ ${r.normalizedName}`);
  const createdRender = renderListOrAttachment(createdLines);
  if (createdRender.mode === "inline" && createdLines.length > 0) {
    embed.addFields({ name: "Successfully created", value: createdRender.text });
  } else if (createdLines.length > 0) {
    lines.push("=== Successfully created ===", ...createdLines, "");
  }

  const failedLines = summary.failed.map(
    (r) => `• ${r.normalizedName} — ${r.errorReason}`,
  );
  const failedRender = renderListOrAttachment(failedLines);
  if (failedRender.mode === "inline" && failedLines.length > 0) {
    embed.addFields({ name: "Failed", value: failedRender.text });
  } else if (failedLines.length > 0) {
    lines.push("=== Failed ===", ...failedLines, "");
  }

  if (totalSkipped > 0) {
    embed.addFields({
      name: "Skipped",
      value: [
        skippedExisting > 0 ? `• ${skippedExisting} already existed` : null,
        skippedDuplicates > 0 ? `• ${skippedDuplicates} duplicate entries in your input` : null,
        skippedInvalid > 0 ? `• ${skippedInvalid} invalid entries` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  return {
    embed,
    attachmentText: lines.length > 0 ? lines.join("\n") : undefined,
  };
}

export function buildErrorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setColor(DANGER_COLOR).setDescription(description);
}
