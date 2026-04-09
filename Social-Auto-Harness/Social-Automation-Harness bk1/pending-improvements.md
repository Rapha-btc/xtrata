# Pending Improvements Queue
**Purpose:** This file is read at the START of every run (Step 1.5) and contains concrete, actionable improvements to apply immediately — no human intervention required. After applying each item, mark it `[DONE]` and log what was done. New items are added at the end of every run.

**Format rules:**
- Each item must be CONCRETE and SELF-EXECUTABLE (i.e. the automation can do it without asking for clarification)
- Items that require human judgment (e.g. "should we launch a collection?") go in the efficiency report recommendations instead
- After applying an item: mark `[DONE - Run date/time]` and log the action in the daily activity log
- Clear `[DONE]` items older than 7 days during the logging step

---

## 🔧 Pending Action Items

### [DONE - 2026-03-29 16:09 BST] Missed steps from Run 4 (2026-03-29 12:09 BST)
**What happened:** Discovery mode run missed follow-backs, retweets, and profile check.
**Applied:** All three steps completed in Run 5 — 7 follow-backs confirmed, 2 retweets posted (@Stackslaborg, @LiquidiumFi), profile check done (no mentions).

### [DONE - 2026-03-29 16:09 BST] Follow count shortfall — need better discovery sources
**What happened:** Run 4 achieved 11/30 target follows.
**Applied:** Used 5 sources in Run 5 (@ArkadikoFinance x8, @MegapontNFT x8, @ALEXLabBTC x1, @aibtcdev x6, sidebar x2) — achieved 25 new + 7 follow-backs = 32 total ✅

### [DONE - 2026-03-29 16:09 BST] Update diversity-rules.md with follower source quality ratings
**Applied:** Follower Source Quality Guide table already present in diversity-rules.md from Run 4. No further action needed.

### [DONE - 2026-03-30 06:09 BST] Mode switch — promotional-specific activated for DYLE0415
**What happened:** Jim manually changed mode to promotional-specific for DYLE0415 launch (173 pieces, 4 STX, sequel to sold-out DYLE0414).
**Applied:** Run 7 completed in promotional-specific mode. 3 replies, 1 standalone tweet, 15 follows. PROMO_END_DATE: 2026-04-06.

### [PENDING] @StacksOrg follower source — rate quality after first use
**What happened:** Run 6 used @StacksOrg for the first time (Strategy 2). Achieved 22/30 target — bot noise was high (many alphanumeric handles, low-post accounts). Quality was moderate.
**Action:** On next use of Strategy 2, if bot noise remains high (>40% of visible followers are bots), downgrade @StacksOrg to MEDIUM quality in diversity-rules.md and reduce target from 30 to 20 for that strategy.
**Auto-executable:** Yes — apply rating update after next Strategy 2 use based on observed quality.

### [DONE - 2026-03-31] Strategy 4 — Update source from @Xverse_App to @NOXtoshi (validated)
**What happened:** Run 7 successfully used Strategy 4 via @NOXtoshi follower list (not @Xverse_App which is invalid). @NOXtoshi produced high-quality Ordinals/generative art accounts — 15/15 quality follows.
**Applied:** diversity-rules.md Strategy 4 row already reflects @NOXtoshi, @prrfbeauty, @RabbitCartel as sources with @Xverse_App marked invalid. No further change needed.

### [PENDING] Fix Strategy 4 — @Xverse_App handle invalid
**What happened:** Run 5 attempted Strategy 4 using @Xverse_App but the handle points to "元象科技" (Chinese tech company) not the Stacks wallet app.
**Action:** Before next use of Strategy 4, find correct Twitter handle for Xverse wallet (the Stacks wallet). Try: @xverse_app (lowercase?), @XverseWallet, or check xverse.app website for their official Twitter. Update the Available Search Strategies table in diversity-rules.md with the correct handle.
**Auto-executable:** No — requires verifying the correct handle first.

### [DONE - 2026-03-30 00:09 BST] @BitflowFinance follower list — 2nd consecutive failure → marked LOW
**What happened:** Run 5 failed once, Run 6 also failed — "Something went wrong" on @BitflowFinance/followers.
**Applied:** Marked @BitflowFinance as LOW quality source in diversity-rules.md Follower Source Quality Guide. Do not attempt again unless source is re-rated.

---

## 📋 Recently Applied (last 7 days)

- [2026-03-29 16:09 BST] Missed steps from Run 4, follow count shortfall, diversity-rules update — all applied in Run 5
- [2026-03-30 00:09 BST] @BitflowFinance marked LOW quality — 2 consecutive follower list failures

---

## 🔄 How This File Works

At the START of each run (Step 1.5), the automation:
1. Reads this file
2. Applies each `[PENDING]` item that is self-executable (no human needed)
3. Marks applied items `[DONE - timestamp]`
4. Skips items marked "Human decision required"

At the END of each run (Step 3), the automation:
1. Adds any new self-improvable findings as `[PENDING]` items
2. Moves old `[DONE]` items (>7 days) to an archive comment at the bottom
3. Never deletes `[PENDING]` items — they stay until actioned or explicitly cancelled
