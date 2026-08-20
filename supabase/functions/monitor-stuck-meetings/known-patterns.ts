/**
 * Known error signatures the monitor recognizes.
 *
 * Source of truth for the human-readable runbook is `/errors.md`. This file is
 * the programmatic mirror — when adding a new entry to errors.md, also add the
 * signature here with the appropriate recovery action.
 *
 * If the monitor encounters a signature NOT in this set, it logs to
 * `monitor_events` with `is_new_pattern = true` and emails ALERT_EMAIL_TO (default admin@oltaflock.ai)
 * so the new pattern can be investigated and added.
 */

export type RecoveryAction =
  | "force_whisper"          // POST process-meeting with forceWhisper:true
  | "trigger_sarvam_webhook" // POST sarvam-webhook with COMPLETED
  | "check_recall_status"    // POST check-recall-status
  | "mark_failed"            // set status=failed with error_message
  | "none";                  // log only, manual intervention required

export interface KnownPattern {
  signature: string;
  recovery: RecoveryAction;
  description: string;
}

export const KNOWN_PATTERNS: Record<string, KnownPattern> = {
  // -- Sarvam patterns --
  "stuck:processing:sarvam_keyerror": {
    signature: "stuck:processing:sarvam_keyerror",
    recovery: "force_whisper",
    description: "Sarvam returned KeyError on long audio. Falling back to Whisper.",
  },
  "stuck:processing:sarvam_silent_empty": {
    signature: "stuck:processing:sarvam_silent_empty",
    recovery: "force_whisper",
    description: "Sarvam returned successful job with empty transcript. Falling back to Whisper.",
  },
  "stuck:processing:sarvam_webhook_lost": {
    signature: "stuck:processing:sarvam_webhook_lost",
    recovery: "trigger_sarvam_webhook",
    description: "Sarvam job is COMPLETED but our webhook never received the callback. Re-firing.",
  },
  "stuck:processing:sarvam_taking_too_long": {
    signature: "stuck:processing:sarvam_taking_too_long",
    recovery: "none",
    description: "Sarvam job still Pending/Running > 30 min. Likely stuck on their side. Manual investigation.",
  },

  // -- Recall lifecycle patterns --
  "stuck:processing:no_sarvam_job": {
    signature: "stuck:processing:no_sarvam_job",
    recovery: "check_recall_status",
    description: "Meeting in processing but no Sarvam job. Recall pipeline likely never ran. Re-trigger via check-recall-status.",
  },
  "stuck:joining:recall_lifecycle": {
    signature: "stuck:joining:recall_lifecycle",
    recovery: "check_recall_status",
    description: "Bot stuck in joining for too long. Check Recall API for actual state.",
  },
  "stuck:in_call:recall_lifecycle": {
    signature: "stuck:in_call:recall_lifecycle",
    recovery: "check_recall_status",
    description: "Bot stuck in_call for too long without recording event. Check Recall.",
  },
  "stuck:recording:recall_lifecycle": {
    signature: "stuck:recording:recall_lifecycle",
    recovery: "check_recall_status",
    description: "Bot stuck recording for too long without call_ended event. Check Recall.",
  },

  // -- Whisper patterns --
  "stuck:transcribing:whisper_died": {
    signature: "stuck:transcribing:whisper_died",
    recovery: "force_whisper",
    description: "process-meeting was triggered but appears to have died (likely OOM on long audio). Retrying once.",
  },
  "stuck:transcribing:whisper_oom_retry_failed": {
    signature: "stuck:transcribing:whisper_oom_retry_failed",
    recovery: "none",
    description: "Whisper has been retried but keeps OOMing. Needs the streaming-Whisper code change. Manual recovery via /tmp/recover_meeting.py.",
  },

  // -- Generic catch-all known states --
  "stuck:processing:unknown_state": {
    signature: "stuck:processing:unknown_state",
    recovery: "none",
    description: "Meeting in processing but doesn't match any known pattern. Investigate.",
  },
};

export function isKnown(signature: string): boolean {
  return signature in KNOWN_PATTERNS;
}
