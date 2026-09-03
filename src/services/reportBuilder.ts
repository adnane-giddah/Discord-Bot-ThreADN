import { AttachmentBuilder, type BaseMessageOptions } from "discord.js";
import { buildFinalReportEmbed } from "../utils/embeds";
import type { ExecutionSummary, PlanResult } from "./types";

export function buildFinalReportMessage(params: {
  operationId: string;
  channelName: string;
  plan: PlanResult;
  summary: ExecutionSummary;
}): BaseMessageOptions {
  const { operationId, channelName, plan, summary } = params;

  const { embed, attachmentText } = buildFinalReportEmbed({
    operationId,
    channelName,
    totalRequested: plan.totalRequested,
    summary,
    skippedExisting: plan.alreadyExisting.length,
    skippedDuplicates: plan.duplicatesInList.length,
    skippedInvalid: plan.invalidEntries.length,
  });

  const files = attachmentText
    ? [
        new AttachmentBuilder(Buffer.from(attachmentText, "utf-8"), {
          name: `${operationId}-details.txt`,
        }),
      ]
    : [];

  return { embeds: [embed], files };
}
