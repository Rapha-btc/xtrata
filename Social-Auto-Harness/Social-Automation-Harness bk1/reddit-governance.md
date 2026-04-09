# Reddit Posting Governance
**Product:** Narrate.AI promotion
**Last Updated:** 2026-03-29
**Purpose:** This file MUST be read at the start of every Reddit automation run. It tracks subreddit rules, posting frequency, and enforces the hard limits that prevent bans. It is also updated at the END of every run with results and recommendations.

---

## ⚠️ Hard Rules — Non-Negotiable

1. **Once per 7 days per subreddit.** Never post to the same subreddit more than once in a 7-day window. Check the Subreddit Registry before every post.
2. **Rule-check before first post.** Before posting to any subreddit not yet in the registry, navigate to its rules page (`reddit.com/r/[name]/about/rules`), summarise the key rules, and log them here.
3. **No promotional language where banned.** If a subreddit's rules prohibit self-promotion, affiliate links, or product plugging, do not post there. Add it to the DO NOT POST list.
4. **Respect karma/account age gates.** Some subreddits require account age or karma minimums. If a post fails silently (no error but doesn't appear), assume a gate was hit — log it and do not retry.
5. **Vary subreddits every run.** Never target the exact same set of subreddits two runs in a row. Always rotate in at least one new subreddit from the candidate pool.
6. **Max 3 posts per run.** Never post to more than 3 subreddits in a single run, regardless of how many valid targets exist.
7. **Value-first framing only.** Every post must provide genuine value to the thread (answer a question, add context, share insight). The Narrate.AI mention must be contextual — never lead with the product.

---

## 🚫 DO NOT POST List

Subreddits where we have been banned, warned, removed, or where rules prohibit our type of content.

| Subreddit | Reason | Date Added | Notes |
|-----------|--------|------------|-------|
| (populate on ban/warning) | | | Add the subreddit that caused the ban here |
| r/[BANNED SUBREDDIT] | Account banned — overposting / rule violation | 2026-03-29 | This is the subreddit that triggered the ban. Identify it and add it here on the next run by checking the account's ban notice or modmail. |

---

## 📋 Subreddit Registry

Rules are cached here after first-time check. Re-verify every 60 days (rules change).

| Subreddit | Rules Summary | Self-Promo Allowed? | Karma/Age Gate? | Last Post | Next Eligible | Total Posts | Status |
|-----------|--------------|---------------------|-----------------|-----------|---------------|-------------|--------|
| (populate as subreddits are verified) | | | | | | | |

**How to add a new subreddit:**
1. Navigate to `reddit.com/r/[name]/about/rules`
2. Read all rules carefully
3. Fill in the row above
4. If self-promotion is disallowed, add to DO NOT POST list instead
5. Save this file before posting

**Candidate subreddits to investigate (not yet verified):**

*Audiobook / narration focused:*
- r/audiobooks
- r/audiobookproduction
- r/ACX (audiobook narrators)
- r/selfpublishing
- r/KDP
- r/WritingForNarration

*Creator / entrepreneur focused:*
- r/passive_income
- r/Entrepreneur
- r/startups
- r/podcasting
- r/contentcreators

*Writing community:*
- r/writing
- r/worldbuilding
- r/fantasywriters
- r/scifiwriting

*AI tools:*
- r/AItools
- r/ChatGPT (check rules carefully)
- r/MachineLearning (usually no promo)

---

## 📅 Run History

Log every run here, whether posts were made or not.

| Date | Run Time | Subreddits Targeted | Posts Made | Posts Skipped (reason) | Issues | Outcome |
|------|----------|---------------------|------------|------------------------|--------|---------|
| 2026-03-28 | 10:40 | (unknown — pre-governance) | unknown | — | Resulted in ban from at least 1 subreddit | ⚠️ BAN |
| (future runs go here) | | | | | | |

---

## 💡 Self-Improvement Log

| Date | Observation | Action Taken / Recommended |
|------|-------------|---------------------------|
| 2026-03-29 | Ban occurred — likely from posting too frequently to same subreddit | Implementing once-per-7-days rule. Also: identify which subreddit caused the ban and add to DO NOT POST list |
| 2026-03-29 | No subreddit rules were being checked before posting | Every new subreddit must now be checked and logged before first post |
| 2026-03-29 | No frequency tracking existed | Run History table now tracks every post with dates |

---

## 📊 Run Efficiency Report Template

At the end of every run, append a block like this to the Run History section above AND to the daily log:

```
### Run Report — [DATE TIME]
- Subreddits checked this run: [list]
- Posts made: [N] to [subreddits]
- Posts skipped: [N] — reasons: [cooldown / rules violation / already posted / etc.]
- New subreddits verified this run: [list]
- Subreddits added to DO NOT POST: [list or "none"]
- Diversity: [% of subreddits that are new vs repeat]
- Reply quality: [brief self-assessment — did posts add real value?]
- Estimated tokens used: ~[N] (rule-checking: ~Nk, reply drafting: ~Nk, logging: ~Nk)
- ⚠️ Issues flagged: [any near-misses, removed posts, warnings]
- 💡 Next run recommendations: [specific subreddits to try, angles that worked well, avoid]
```

---

## 🔄 Reply Angle Rotation

Track which angles have been used to ensure variety and genuine value.

| Angle | Description | Last Used | Notes |
|-------|-------------|-----------|-------|
| Cost efficiency | "I used Narrate.AI and it saved X vs hiring narrator" | | Lead with specifics |
| Time savings | "Narrate.AI got me from draft to audio in X hours" | | Works well in KDP/selfpub threads |
| Quality comparison | "The AI voice quality surprised me — here's what I found" | | Be honest, not hypey |
| Workflow integration | "How it fits into my publish pipeline" | | Good for r/selfpublishing |
| Answering a direct question | Directly answering "what's cheapest way to make an audiobook?" | | Most natural, least spammy |
