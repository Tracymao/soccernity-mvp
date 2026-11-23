# Counsel review pack

**Soccernity: draft documents and one list of questions for counsel**

*Pack version 1.5, prepared 2026-11-23 on branch `copy/rekognition-render-live`. Every document in this pack is a DRAFT: NOT APPROVED, NOT LEGAL ADVICE. This pack decides nothing for the founder or for counsel.*

## 1. Cover page

**Who Soccernity is.** Soccernity is a social platform for grassroots football: players who are not part of a club or academy, and the fans, coaches and communities around them. It has users in the UK, Nigeria, the US and the EU, and many of those users are children. It has accounts, posts, direct messages, community rooms, a weekly video-skill Contest with a points leaderboard, pictures and video uploaded by users, and an admin console used by staff. The platform is not live yet.

**What counsel is asked.** Counsel is asked to read the eight drafts listed in section 2 and to answer the 71 questions in section 3. Every question is something that is still unresolved and needs a lawyer. Each question says whether it is needed before the documents are signed or can follow launch.

**Status of every draft.** Every draft in this pack is NOT APPROVED. Every sign-off block is empty. A draft being written, or a question being marked, closes nothing. Where a draft says what the founder decided, that records the founder's decision; it does not record counsel's view, and the pack never says counsel agrees.

**What counsel is NOT asked.**

- Anything the founder has already decided (disposition B). Those items are in an internal list that is not part of this pack.
- Anything counsel has already signed off (disposition C), for example the scope of regimes, the lawful basis, the special-category clause, the governing-law clause, no EU representative, and card verification as the COPPA control.
- Housekeeping and engineering items (disposition D).
- The 56 admin two-factor strings. They are staff-only instructions and the founder cleared them himself without counsel (Decision Log #531).
- The 144 on-screen strings in section 4. The founder reviewed every one and cleared the tag himself (R108, 2026-11-22); section 4 keeps them as a record.
- Whether launch should wait. **None of the questions below blocks launch** (Decision Log #524, #532). Uploads go live at launch with `MEDIA_UPLOADS_ENABLED` as the off switch and no counsel gate. Launching before hash-matching exists is the founder's own risk and is not counsel's view. The founder will not register with NCMEC or the UK reporting body before uploads go on (Decision Log #529).

**How labels work.** "Needed before the documents are signed" means counsel's answer changes the text of a document or the on-screen wording that is being signed. "Can follow launch" is a default the founder may veto, with a one-clause reason on each question.

## 2. Documents

Counsel last gave input on the legal copy at v0.7 (Decision Log #4 and #203; the sign-off covers the decisions, not the live prose). Counsel has not seen v0.16 to v0.23 of the legal copy. No other draft in this pack has been reviewed by counsel. Section 2 lists the current version of each draft; the source references in section 3 name the version in which the question was raised, so they can be older than the versions listed in section 2.

| Document (file in `docs/`) | Version | What changed since counsel last saw it | Questions that cite it |
|---|---|---|---|
| Legal copy (`legal-copy-draft-tos-privacy-policy.md`) | v0.23 | Counsel last saw v0.7 (resolved decisions applied). Since then (including v0.18: Google and Facebook sign-in removed from the text, built-feature markers removed, the 365-day set-aside figure no longer stated in public text): Contact Us retention and notice, direct-message retention, what staff see when a message is reported, soft removal of content, suspension and appeals, report retention restored to the 6-7 year range, the suspected-illegal-imagery path, and (v0.17) every Part C row sorted into A, B, C or D. Later versions (v0.19 to v0.21) made a wording pass with no change of meaning, removed the pending-legal-review tag on the founder's decision of 2026-11-22, and kept the earlier counsel dispositions. v0.22 brings two vendor statements up to date because the accounts are now live (the error-monitoring and storage vendors, and an AWS account that exists but has no check key configured); nothing is deployed and no counsel disposition changed. | 21 questions: Q1, Q3, Q4, Q6, Q7, Q14, Q28, Q33, Q36, Q37, Q38, Q39, Q40, Q41, Q47, Q61, Q67, Q68, Q69, Q70, Q71 |
| DPIA (`sprint-1-dpia-outline-draft.md`) | v0.15 | No counsel sign-off exists; the sign-off block is empty. v0.9 sorted every one of the 51 open items into A, B, C or D and recorded that uploads no longer wait for counsel (Decision Log #524). v0.10 re-marks items 40, 41 and 47 from "decided by the founder" (B) to founder or engineering housekeeping (D), because no decision exists for them; marks hosting as decided (Decision Log #391, amended by #536 for the database and cache locations); and adds pointers to later built work. v0.11 states where each service is hosted (Decision Log #536, #541) and makes a wording pass with no change of meaning; v0.12 removes the pending-legal-review tag on the founder's decision of 2026-11-22. v0.13 corrected the hosting statement (Render is created but not configured) and the label of the client applications this draft has not reviewed. v0.14 updates the Sentry, AWS and storage statements because the accounts are now live; nothing is deployed, no risk was re-rated and no disposition changed. | 12 questions: Q1, Q6, Q7, Q14, Q32, Q34, Q37, Q39, Q42, Q47, Q58, Q59 |
| Incident plan (`incident-response-and-breach-notification-plan-draft.md`) | v0.13 | No counsel review. v0.7 re-sorted the questions into A, B, C or D and recorded the built suspected-illegal-imagery path, uploads at launch, detection after launch (not built) and the Docker image. v0.8 folds Q18 into Q5, re-marks Q19, Q20, Q23 and Q24 (a) and (b) as housekeeping (D) and Q24 (c) as decided (B, Decision Log #503), and fixes the "no account exists" lines. v0.9 states hosting locations (Decision Log #536, #541) and makes a wording pass with no change of meaning; v0.10 removes the pending-legal-review tag on the founder's decision of 2026-11-22. v0.11 corrected the platform-status lines (R2 buckets decided under #535, AWS not yet created, Google and Meta sign-in removed under #479) and refreshed its pointers to the current draft versions. v0.12 updates the vendor-account statements (Sentry has a real DSN, AWS and the R2 buckets exist) and its pointers; nothing is deployed and no disposition changed. | 17 questions: Q3, Q6, Q15, Q42, Q45, Q46, Q47, Q48, Q49, Q50, Q51, Q52, Q53, Q54, Q56, Q57, Q60 |
| Post-media addendum (`dpia-addendum-post-media-draft.md`) | v0.11 | No counsel review. v0.5 recorded the decided review model (automatic check first, then report-and-review), the set-aside path and profile pictures and covers, and sorted every question. v0.6 re-marks section 7 question 5 from D to B (staff legal protection and welfare is the founder's duty, Decision Log #533; 5a stays A) and section 12 question 19 from A to D (Decision Log #534), and brings stale version references up to date. v0.7 states hosting locations (Decision Log #536, #541) and makes a wording pass with no change of meaning; v0.8 removes the pending-legal-review tag on the founder's decision of 2026-11-22. v0.9 replaced the stale "v0.3 DPIA" labels with the current DPIA version where the cited section still says the same thing. v0.10 updates the statements that no AWS account exists (the account exists, no check key is configured, nothing is sent to AWS today) and points to DPIA v0.14. | 19 questions: Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q16, Q17, Q20, Q34, Q35, Q43, Q62 |
| Post-media Part C (`legal-copy-part-c-post-media-draft.md`) | v0.7 | No counsel review. v0.2 sorted every question and note and updated the wording options to the decided review model. v0.3 refreshed stale references only (legal draft version, Part C row numbers); no disposition changed. v0.4 removes the pending-legal-review tag on the founder's decision of 2026-11-22; no wording or disposition changed. v0.5 updated one pointer to the current legal copy version. v0.6 points to legal copy v0.22 and updates the no-AWS-account statement. | 9 questions: Q1, Q3, Q13, Q16, Q43, Q61, Q62, Q65, Q66 |
| Contest and view-data addendum (`dpia-addendum-contest-view-data-draft.md`) | v0.7 | No counsel review. v0.2 recorded removed Contest entries (B-300) and the report-retention cascade (B-307) and sorted every question. v0.3 refreshed stale version references only; no disposition changed. v0.4 removes the pending-legal-review tag on the founder's decision of 2026-11-22; no wording or disposition changed. v0.5 replaced stale "v0.3 DPIA" labels with the current DPIA version. v0.6 corrects the sentence about where its risk numbers continue from (R17 to R22 collide with no DPIA risk) and points to DPIA v0.14. | 12 questions: Q25, Q26, Q27, Q28, Q29, Q30, Q31, Q32, Q34, Q44, Q63, Q64 |
| View-data Part C (`legal-copy-part-c-view-data-draft.md`) | v0.7 | No counsel review. v0.2 sorted every question and note against the current built behaviour. v0.3 refreshed stale version and row-number references only; no disposition changed. v0.4 removes the pending-legal-review tag on the founder's decision of 2026-11-22; no wording or disposition changed. v0.5 updated one pointer to the current legal copy version. v0.6 points to legal copy v0.22. | 5 questions: Q25, Q44, Q61, Q63, Q64 |
| Cloudflare draft (`cloudflare-processor-and-cross-border-draft.md`) | v0.6 | No counsel review. v0.2 sorted every question. v0.3 marks Q9 (which option) as decided by the founder (B, Decision Log #449) in every place it appears, and refreshes stale references. v0.4 states hosting locations (Decision Log #536, #541) and makes a wording pass with no change of meaning; v0.5 removes the pending-legal-review tag on the founder's decision of 2026-11-22. Position on the proxy: the media address `media.soccernity.com` is proxied by Cloudflare from the start (Decision Log #541); the proxy in front of the API and the static sites is adopted in principle but building it is deferred until after launch (Decision Log #449, #518). v0.6 corrected the statements that no Cloudflare account exists and that the proxy is built at the launch gate (an account exists and the media address is proxied from the start under #541; the proxy is deferred until after launch under #518). | 10 questions: Q18, Q19, Q20, Q21, Q22, Q23, Q24, Q55, Q61, Q68 |

Document codes used below: LC legal copy, DP DPIA, IP incident plan, PA post-media addendum, PC post-media Part C, CA contest and view-data addendum, VC view-data Part C, CF Cloudflare draft.

## 3. Questions

There are **71 questions**, numbered Q1 to Q71, in eight groups. Each question appears once; where several drafts ask the same thing, the question lists every place it appears. Counsel answers a question once and the answer applies to every document that cites it.

### Group 1: Suspected illegal imagery (none of these blocks launch)

**Q1.** Does any law that applies to Soccernity (UK, Nigeria, US, EU) require, or strongly expect, a platform that lets users upload pictures and video to run proactive detection (hash-matching) of known illegal child imagery?

- *Why it matters:* Soccernity is launching without it and plans to add it after launch (IWF Image Intercept first, Hive as the fallback). The founder accepts that as his own risk; he does not claim counsel agrees.
- *Label:* Can follow launch (default, founder may veto): the founder has decided to launch first (Decision Log #524) and detection is planned for after launch (#526).
- *Sources:* Post-media addendum v0.6, section 7 question 1; Post-media Part C v0.3, question 7; Legal copy v0.18, in-text marker 10; Legal copy v0.18, Part C row 37; DPIA v0.10, section 5 item 50.

**Q2.** Which online-safety, abuse-imagery and platform-duty rules apply in each country (risk assessment, reporting, record-keeping, duties because users include children), and which of them does Soccernity already meet?

- *Why it matters:* The drafts name no such regime and the founder has not been told which ones apply.
- *Label:* Can follow launch (default, founder may veto): no document text depends on the answer before launch.
- *Sources:* Post-media addendum v0.6, section 7 question 1; Post-media addendum v0.6, section 7 question 7.

**Q3.** When a trained moderator, a user report or an automatic label suggests an uploaded file may be illegal child imagery: which bodies must or may it be reported to (UK, US, EU, Nigeria), by whom, and by when? What should a vetted staff member do today, given that the founder will not register with the US or UK reporting bodies before launch?

- *Why it matters:* A vetted admin can set the file aside and record that a report was made, but there is no prepared route to file one, and no deadline has been checked.
- *Label:* Can follow launch (default, founder may veto): the set-aside path is built and kept private; the founder has chosen to launch without registering (#529).
- *Sources:* Post-media addendum v0.6, section 7 question 3; Incident plan v0.8, question 11; Incident plan v0.8, question 22; Legal copy v0.18, Part C row 37; Post-media Part C v0.3, note at line 182.

**Q4.** Evidence. May or must Soccernity keep a file it has set aside as possibly illegal? Is the default of 365 days right, what should happen when it ends, and who may open or copy the file? The Terms and Policy no longer state the period (Decision Log #534); should they state any period, and in what words?

- *Why it matters:* The file is kept privately, for 365 days by default, past account deletion, and every deletion path leaves it alone. The 365 days is a default, not a legal figure.
- *Label:* Needed before the documents are signed: counsel's answer decides whether the Policy may state any keeping period at all.
- *Sources:* Post-media addendum v0.6, section 7 question 4; Legal copy v0.18, open item 2.

**Q5.** Is it lawful for Soccernity staff who are not child-safety vetted to open a file suspected to be illegal imagery of an adult? (Files that may involve a child are already limited to vetted staff; staff welfare and vetting are the founder's own HR duty and are not asked.)

- *Why it matters:* Only a child-safety-vetted admin can set a file aside, but who may open a suspected adult's file at all is not settled in the drafts.
- *Label:* Can follow launch (default, founder may veto): staff welfare is an operating duty and no public text depends on it.
- *Sources:* Post-media addendum v0.6, section 7 question 5 (part 5a only).

**Q6.** Soft removal. A removed post, comment or message is hidden but kept in clear text for staff, and the private copy of a removed post's file is kept until the removing report closes. Is that acceptable, and is deleting the file when the removal is confirmed (about 30 days after the decision by default) safe given that a statutory duty could need it?

- *Why it matters:* The wording the Policy uses ('hidden and kept') and the moment the file is deleted both rest on the answer.
- *Label:* Can follow launch (default, founder may veto): the behaviour is built, the Policy wording is hedged, and the set-aside route can already protect a file.
- *Sources:* Incident plan v0.8, question 22; Post-media addendum v0.6, section 12 question 21; Legal copy v0.18, Part C row 50; DPIA v0.10, section 5 item 34.

**Q7.** After a removed post's report is deleted by the retention sweep, the post and its file records go with it, and a Contest-entry post may be released. Is that the right end of the record for a child's removed file, and does the same answer cover the legacy admin-judged Contest cycle?

- *Why it matters:* The founder has not decided this; the drafts only note the point.
- *Label:* Can follow launch (default, founder may veto): the sweep is built, runs after 6 or 7 years, and no public text depends on it.
- *Sources:* Post-media addendum v0.6, section 12 question 24; Legal copy v0.18, Part C row 50; DPIA v0.10, section 5 item 34.

### Group 2: Automated rejection of a child's file, and video from children

**Q8.** Is an automatic rejection of a child's file a decision to which UK or EU GDPR Article 22 applies? If so, is the human route (a report, a moderator review) enough?

- *Why it matters:* Rekognition can reject a file with a generic reason and no person looks at it first; the uploader sees only the generic reason.
- *Label:* Needed before the documents are signed: the Policy must say whether automated decision-making is used and what the person can do about it.
- *Sources:* Post-media addendum v0.6, section 12 question 2.

**Q9.** Is accepting video from children proportionate, given that video is checked by sampling frames (about one every 5 seconds), audio is not checked, and short content can be missed?

- *Why it matters:* Video is allowed for all uploaders on the same footing as pictures, including children.
- *Label:* Can follow launch (default, founder may veto): the founder has decided to launch with video; the question is about proportionality, not the wording.
- *Sources:* Post-media addendum v0.6, section 12 question 3.

**Q10.** What lawful basis supports sending a child's image or video frames to Amazon Web Services for a safety check, and does the answer change for under-13s and under-16s?

- *Why it matters:* Rekognition is the only processor that sees a child's file before a person does.
- *Label:* Needed before the documents are signed: the Policy lists the basis and the processor.
- *Sources:* Post-media addendum v0.6, section 12 question 4.

**Q11.** Is any accuracy testing required before the check is relied on, and on what data (the drafts do not say how a test could be run without handling real illegal material)?

- *Why it matters:* The thresholds are tuned by the founder with no tested accuracy figures.
- *Label:* Can follow launch (default, founder may veto): no public text depends on it.
- *Sources:* Post-media addendum v0.6, section 12 question 5.

**Q12.** The thresholds are stricter when the uploader is a child. May they differ by uploader age only, or must they reflect who is shown in the file?

- *Why it matters:* A child can upload an adult's picture and an adult can upload a child's.
- *Label:* Can follow launch (default, founder may veto): no public text depends on it.
- *Sources:* Post-media addendum v0.6, section 12 question 6.

**Q13.** The Terms-side draft forbids uploading images of children (section 3.6). Is such a rule appropriate, lawful and enforceable on a children's football platform?

- *Why it matters:* Football pictures of teams and matches often include children; the rule is in the draft and nothing in the product enforces it.
- *Label:* Needed before the documents are signed: the rule is in the Terms text.
- *Sources:* Post-media Part C v0.3, question 5.

### Group 3: Cross-border transfers and processors

**Q14.** For each of the processors the Policy names (Postmark, the object store, Sentry, Render, Neon, Upstash and others), is the transfer and data-location position acceptable under UK GDPR, EU GDPR and the Nigerian Data Protection Act 2023, and what must the Policy say?

- *Why it matters:* Render runs in Frankfurt, Neon and Upstash run in London (eu-west-2, not the EU) and the R2 buckets are in the EU jurisdiction. Several processors are US companies and no transfer assessment has been written.
- *Label:* Needed before the documents are signed: the Policy section on processors and international transfers cannot be final without it.
- *Sources:* Legal copy v0.18, Part C row 9; Legal copy v0.18, Part C row 20; DPIA v0.10, section 5 item 3.

**Q15.** Do the processor contracts (UK and EU Article 28 terms, the Nigerian equivalent) with Render, Neon, Upstash, Postmark and the object store meet the requirements, and who at Soccernity must sign or accept them?

- *Why it matters:* The accounts exist but nobody has checked what each vendor's standard terms say.
- *Label:* Can follow launch (default, founder may veto): a contract check, not a wording question.
- *Sources:* Incident plan v0.8, question 17.

**Q16.** Is Amazon Web Services an acceptable processor for children's images, and what contract and what opt-out (AWS may use inputs to improve its services unless the account opts out) is needed?

- *Why it matters:* The founder set out to set the opt-out before any key was configured; the AWS account exists and the check key is now configured, but whether the opt-out was set is not confirmed.
- *Label:* Needed before the documents are signed: the Policy names AWS and must describe the opt-out.
- *Sources:* Post-media addendum v0.6, section 12 question 7; Post-media Part C v0.3, note at line 142.

**Q17.** Does the chosen Rekognition region (Ireland by default) process only in that region, and does the chain from the object store (R2, EU jurisdiction) to Rekognition create a transfer that needs its own assessment?

- *Why it matters:* Where a child's picture is processed is a fact the Policy must state.
- *Label:* Needed before the documents are signed: the Policy states the region.
- *Sources:* Post-media addendum v0.6, section 12 question 9.

**Q18.** If Soccernity puts Cloudflare in front of its sites, is Cloudflare a processor for all proxied traffic and a controller for anything of its own?

- *Why it matters:* A proxy sees login details, tokens and a child's content in transit. The proxy is deferred until after launch (#518) but its text is drafted.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch (Decision Log #518).
- *Sources:* Cloudflare draft v0.3, question 1.

**Q19.** Cloudflare says its own services are not for under-18s. Does that, or the age mix of Soccernity's users, change what Soccernity may do?

- *Why it matters:* Most of Soccernity's users are under 18.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch.
- *Sources:* Cloudflare draft v0.3, question 3.

**Q20.** Which route applies to the UK and EU transfer to Cloudflare (adequacy, standard contractual clauses plus the UK addendum, the data bridge), and is a written transfer assessment required? The same question for the pictures sent to AWS.

- *Why it matters:* The UK transfer articles were rewritten in February 2026 and the drafts rely on a summary of the new text.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch; the AWS part is covered by the AWS questions above.
- *Sources:* Cloudflare draft v0.3, question 4; Post-media addendum v0.6, section 12 question 10.

**Q21.** Nigeria: on what basis under NDPA sections 41 and 43 and Schedule 5 of the General Application and Implementation Directive may Nigerian users' data pass through Cloudflare?

- *Why it matters:* No Nigerian regulator decision on Cloudflare was found.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch.
- *Sources:* Cloudflare draft v0.3, question 5.

**Q22.** United States: do COPPA or any state law apply to an edge proxy that handles under-13 users' IP addresses and content?

- *Why it matters:* The proxy would see every request from US under-13s.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch.
- *Sources:* Cloudflare draft v0.3, question 6.

**Q23.** Does Cloudflare's data processing agreement bind a Free-plan account without an extra step, and how is acceptance recorded?

- *Why it matters:* The drafts could not confirm this from Cloudflare's documents.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch.
- *Sources:* Cloudflare draft v0.3, question 7.

**Q24.** What is the retention of Cloudflare's customer logs on the free plan, who at Soccernity may see them, and is that acceptable?

- *Why it matters:* No retention figure for the free plan was found.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch.
- *Sources:* Cloudflare draft v0.3, question 8.

### Group 4: Profiling of children through view data and points

**Q25.** Is processing the view, impression and dwell data of children (the stores that rank Contest entries, balance finalist exposure and award points) permissible, on what lawful basis, and for under-13s?

- *Why it matters:* These records are kept for a short time, and the daily caps and ranking rules are built.
- *Label:* Needed before the documents are signed: the Policy table and the guardian screen describe this data.
- *Sources:* Contest and view-data addendum v0.3, question 1; Contest and view-data addendum v0.3, question 15.

**Q26.** Does the combination of view records, impression records, the points ledger and the leaderboard amount to profiling of children, and if so what follows (a separate assessment, a stricter basis, an opt-out)?

- *Why it matters:* Points and ranks are public on a leaderboard that shows children by username.
- *Label:* Needed before the documents are signed: the answer decides how the Policy describes the processing.
- *Sources:* Contest and view-data addendum v0.3, question 2.

**Q27.** Is the guardian's consent to use Soccernity enough for this processing, or does it need its own consent? For an under-13 US child whose guardian completed card verification, does that consent extend to it?

- *Why it matters:* Today the consent screen does not mention view data; a change to it would also change the screen version.
- *Label:* Needed before the documents are signed: it decides whether the consent screen and the stored evidence change.
- *Sources:* Contest and view-data addendum v0.3, question 3; Contest and view-data addendum v0.3, question 5.

**Q28.** Do the reward mechanics (points, a public leaderboard with minors' usernames, daily caps of 40 given and 20 received) need a specific assessment, and is it acceptable that minors' usernames and points are public to every signed-in user?

- *Why it matters:* The founder decided children appear on the leaderboard under their usernames (Decision Log #45); counsel has not been asked whether that is proportionate.
- *Label:* Needed before the documents are signed: the Policy describes the leaderboard.
- *Sources:* Contest and view-data addendum v0.3, question 12; Legal copy v0.18, Part C row 10.

**Q29.** Is 'no opt-out' consistent with data protection by design and default? Should viewing for points be off by default for children, and should unverified-email accounts be treated the same as verified ones?

- *Why it matters:* Viewing is how a child earns points; there is no way to turn it off.
- *Label:* Can follow launch (default, founder may veto): a design question, not a text question.
- *Sources:* Contest and view-data addendum v0.3, question 13.

**Q30.** May the creator's received-points record carry the id of the viewer who earned it for them (`counterpartId`)? If not, what must be removed?

- *Why it matters:* It lets staff reconstruct who viewed whose post; the Policy says creators never see this.
- *Label:* Needed before the documents are signed: the disclosure about who sees who viewed depends on it.
- *Sources:* Contest and view-data addendum v0.3, question 8.

**Q31.** Does the admin view of exposure numbers (aggregates only) need an access-control or audit-logging rule?

- *Why it matters:* Staff can see how many times a finalist was shown to viewers; nothing logs who looked.
- *Label:* Can follow launch (default, founder may veto): no public text depends on it.
- *Sources:* Contest and view-data addendum v0.3, question 14.

**Q32.** Should the Contest have its own data protection impact assessment section or a separate one? Is the residual risk rating in the main assessment acceptable, and is prior consultation with the regulator (Article 36) needed?

- *Why it matters:* The main assessment has not been signed off and its sign-off block is empty.
- *Label:* Needed before the documents are signed: the assessment cannot be signed without it.
- *Sources:* Contest and view-data addendum v0.3, question 16; DPIA v0.10, section 5 item 13.

**Q33.** Is it acceptable for a profile picture, cover photo, bio and country to be visible to other users, including children seeing other children's profiles?

- *Why it matters:* These are now collected at profile creation and shown on public profile pages.
- *Label:* Needed before the documents are signed: the Policy describes what other users can see.
- *Sources:* Legal copy v0.18, Part C row 43.

### Group 5: Erasure, anonymisation, age changes and retention

**Q34.** When an account is anonymised, the posts, comments, messages and Contest and points records stay under '[deleted user]' or an anonymised id. Does that meet the right to erasure (Article 17 and the Nigerian equivalent), including the object-store file gap and the points and engagement rows that stay?

- *Why it matters:* The founder chose anonymisation in place over deletion (Decision Log #341); some rows are kept and a deleted post's files can be left.
- *Label:* Needed before the documents are signed: the Policy describes what stays after deletion.
- *Sources:* DPIA v0.10, section 5 item 12; DPIA v0.10, section 5 item 21; Contest and view-data addendum v0.3, question 6; Post-media addendum v0.6, section 12 question 16.

**Q35.** After anonymisation, are the media check labels and decision fields linked to an anonymised id still personal data?

- *Why it matters:* Labels and the moderator's id may be kept with the file record.
- *Label:* Can follow launch (default, founder may veto): no public text depends on it.
- *Sources:* Post-media addendum v0.6, section 12 question 17.

**Q36.** Who exercises a minor's data-subject rights, and how should a disagreement between the minor and the guardian be handled?

- *Why it matters:* The drafts say a guardian's request supersedes the child's wishes but do not cover older children.
- *Label:* Needed before the documents are signed: the Policy section on rights.
- *Sources:* Legal copy v0.18, Part C row 12.

**Q37.** Consent record. Is keeping the consent audit trail for 6 months after anonymisation (and no guardian identity) sufficient under UK GDPR and the Nigerian act? Does the trail (screen version, device type, verification method) prove consent well enough, and what should a guardian be able to do to withdraw it?

- *Why it matters:* The record is the only proof a guardian consented.
- *Label:* Needed before the documents are signed: the Policy retention table and the consent screen depend on it.
- *Sources:* Legal copy v0.18, Part C row 14; DPIA v0.10, section 5 item 16; Legal copy v0.18, Part C row 6; Legal copy v0.18, Part C row 17; DPIA v0.10, section 5 item 8.

**Q38.** Age reclassification. The daily job re-classes accounts when a child passes 13, 16 or 18, so an account can be mis-classed for up to about 24 hours. Is that acceptable, and is reliance on a self-declared date of birth acceptable? Is it acceptable that a correction to a younger age re-applies restrictions with no notice?

- *Why it matters:* The rules that restrict children depend on the date of birth.
- *Label:* Needed before the documents are signed: the Terms and Policy describe the window.
- *Sources:* Legal copy v0.18, Part C row 24.

**Q39.** Guardian authority at 18: the approved wording says a guardian's request to delete a minor's account supersedes the minor's wishes, but says nothing about accounts that have since turned 18. How long should the age-reclassification log be kept, and should the guardian's details be reduced after 18? Is the email to the guardian when a young person turns 18 appropriate?

- *Why it matters:* Counsel approved the first sentence in an earlier draft; the age-18 case is an open edge.
- *Label:* Needed before the documents are signed: the Terms section on deletion and the Policy on retention depend on it.
- *Sources:* Legal copy v0.18, Part C row 26; DPIA v0.10, section 5 item 20.

**Q40.** Investigation hold: an account involved in an open report is held without any maximum, and for a period after the report closes. Is an open-ended hold acceptable, and is the purge rule (anonymised rows of never-approved minors and no-content accounts removed after 30 days) and the length of the appeal window acceptable?

- *Why it matters:* Neither the 6-month post-closure period nor the 30-day appeal window is a counsel figure.
- *Label:* Needed before the documents are signed: the Terms and Policy state the periods.
- *Sources:* Legal copy v0.18, Part C row 23; Legal copy v0.18, Part C row 40.

**Q41.** When bad faith is found against a reporter, or a legal hold is in place, the reporter's data is held in full so records exist if the reported person takes legal action. Is that lawful and proportionate, and is the narrow wording right?

- *Why it matters:* It is the only place where a reporter's data is kept beyond normal rules.
- *Label:* Needed before the documents are signed: the Terms and Policy contain the sentence.
- *Sources:* Legal copy v0.18, Part C row 39.

**Q42.** Report retention. Counsel approved '6 to 7 years'; the system keeps a closed report 6 years, and 7 if it concerns a child. Does that split fit a later inquiry or statutory report, and is a report that was dismissed or found to be made in bad faith inside the approved range?

- *Why it matters:* The range is recorded as counsel's; the exact split and the dismissed case were chosen by the founder.
- *Label:* Needed before the documents are signed: the Policy retention table states the range.
- *Sources:* DPIA v0.10, section 5 item 39; DPIA v0.10, section 5 item 42; Incident plan v0.8, question 21.

**Q43.** Media retention: what is defensible for a rejected file, an upload never attached to a post, the check labels and reason, and the moderator's id; and may the Policy describe each of the retention options?

- *Why it matters:* Rejected and unattached files are deleted on every path unless protected; the labels have no stated period.
- *Label:* Needed before the documents are signed: the Policy retention table needs a figure or a statement for each.
- *Sources:* Post-media addendum v0.6, section 12 question 14; Post-media Part C v0.3, question 8; Post-media Part C v0.3, notes at lines 170 and 234 (retention of the check's labels and the disclosure consequence of each retention option).

**Q44.** View-data retention. What period is defensible for the view records and the exposure records, for the aggregate rows, and for the backup copies; is a separate purge job a required control; and is the proposed retention-table row adequate while those periods are not set?

- *Why it matters:* The periods are not set and the backup horizon of the host is not confirmed.
- *Label:* Needed before the documents are signed: the Policy table has an open row until the periods are set.
- *Sources:* Contest and view-data addendum v0.3, question 7; Contest and view-data addendum v0.3, question 9; Contest and view-data addendum v0.3, question 10; View-data Part C v0.3, question 5.

### Group 6: Breach notification

**Q45.** When two regimes apply to the same breach, is one filing with merged contents acceptable, or must each regulator get its own?

- *Why it matters:* The plan has one template and does not say.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document, not public text.
- *Sources:* Incident plan v0.8, question 2.

**Q46.** What makes Soccernity 'aware' for the 72-hour clock in each regime?

- *Why it matters:* The wording of 'aware' differs and the plan uses the founder's reading.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document.
- *Sources:* Incident plan v0.8, question 3.

**Q47.** Is a leaked database copy without its encryption key a notifiable breach, and what may the Policy say about encryption at rest, given that private messages are not end-to-end encrypted?

- *Why it matters:* The Policy and the plan both make commitments about encryption that depend on the answer.
- *Label:* Needed before the documents are signed: the Policy contains an encryption statement.
- *Sources:* Incident plan v0.8, question 4; DPIA v0.10, section 5 item 32; Legal copy v0.18, Part C row 11; Legal copy v0.18, Part C row 21.

**Q48.** Must a guardian be told when a child's data is breached, as a separate recipient, and is the child also told (under 13, under 16)? Must the Policy say so?

- *Why it matters:* The plan has a draft guardian notice; the Policy promises guardian notification in general terms.
- *Label:* Needed before the documents are signed: the Policy contains a promise that depends on the answer.
- *Sources:* Incident plan v0.8, question 5; Incident plan v0.8, question 6.

**Q49.** The live Policy contains no breach-notification text beyond one sentence. Does that omission create a risk that counsel should fix?

- *Why it matters:* The plan describes obligations the Policy does not mention.
- *Label:* Needed before the documents are signed: the Policy text depends on it.
- *Sources:* Incident plan v0.8, question 7.

**Q50.** How long should incident records, evidence copies and the breach register be kept, compared with the retention the Policy states?

- *Why it matters:* A breach register must be kept; the Policy states shorter periods for related data.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document.
- *Sources:* Incident plan v0.8, question 8.

**Q51.** Who else must be told in a serious incident (police, insurers, a processor's regulator), and is a second named responder required at launch rather than one person?

- *Why it matters:* The plan names roles as placeholders only; one person leads.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document.
- *Sources:* Incident plan v0.8, question 11; Incident plan v0.8, question 12.

**Q52.** Nigeria: does the NDPA require Soccernity to register as a data controller 'of major importance'?

- *Why it matters:* It decides whether a registration filing is a launch duty.
- *Label:* Needed before the documents are signed: a filing duty, if it exists, applies at launch.
- *Sources:* Incident plan v0.8, question 13.

**Q53.** Is a separate safeguarding-incident plan (a child at risk, not a data breach) needed, and who should write it?

- *Why it matters:* The plan covers breaches and treats safeguarding incidents only briefly.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document.
- *Sources:* Incident plan v0.8, question 14.

**Q54.** How should the breach assessment be routed so that it is privileged in each country?

- *Why it matters:* The plan lets the founder assess first; counsel may want a different route.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document.
- *Sources:* Incident plan v0.8, question 16.

**Q55.** Cloudflare's own breach notice to a customer has no hour limit ('without undue delay'). How does that fit the 72-hour clocks?

- *Why it matters:* If the proxy is added, Soccernity may learn of an incident late.
- *Label:* Can follow launch (default, founder may veto): the proxy is deferred until after launch.
- *Sources:* Cloudflare draft v0.3, question 11.

**Q56.** United States: which state breach laws apply to a service with US users, and do any apply to a date of birth plus email plus name combination? Is Soccernity 'directed to children' or does it have actual knowledge of under-13 US users, does COPPA itself impose a breach duty, and does the FTC expect a notice? Does the Health Breach Notification Rule or the FTC Act matter, and what is the position on card data (only a Stripe reference is held, PCI-DSS status)?

- *Why it matters:* Decision Log #4 settles that the US is in scope, not these questions.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document and no public text depends on it.
- *Sources:* Incident plan v0.8, question -US1; Incident plan v0.8, question -US2; Incident plan v0.8, question -US3; Incident plan v0.8, question -US4.

**Q57.** European Union: if EU users are targeted or monitored, which supervisory authority is notified when there is no EU establishment? Does EU-region hosting alone create a duty for UK and Nigerian users' data? Are the 72-hour and high-risk tests the same for a child's data, and do member states add anything (such as a notice to the holder of parental responsibility)?

- *Why it matters:* Decision Log #4 settles that there is no EU representative, not these questions.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document and no public text depends on it.
- *Sources:* Incident plan v0.8, question -EU1; Incident plan v0.8, question -EU2; Incident plan v0.8, question -EU3; Incident plan v0.8, question -EU4.

### Group 7: Legal facts the drafts recall from memory

**Q58.** The drafts quote Article 8 (age of digital consent) and the member-state age table from memory. Please confirm the age that applies in each country Soccernity serves, and whether it depends on the lawful basis.

- *Why it matters:* The age gate and the guardian rules are built on these ages.
- *Label:* Needed before the documents are signed: the Terms and Policy state ages.
- *Sources:* DPIA v0.10, section 5 item 23.

**Q59.** Every legal proposition in sections 2.5 and 2.6 of the assessment (COPPA and the 2025 amendments, state laws, UK and Nigerian rules) was written from general knowledge, not retrieved text. Please confirm or correct each.

- *Why it matters:* The assessment is the basis of the guardian-consent and card-verification design.
- *Label:* Needed before the documents are signed: the assessment cannot be signed with unverified legal statements.
- *Sources:* DPIA v0.10, section 5 item 28.

**Q60.** The breach plan states UK and Nigerian breach-notification facts without a reading of the official text: the ICO's own pages could not be read, the UK text now names 'the Commission' in places, and the NDPA and GAID were not read in full. Please confirm each statement.

- *Why it matters:* The clocks and contents in the plan rest on these statements.
- *Label:* Can follow launch (default, founder may veto): the plan is an operating document.
- *Sources:* Incident plan v0.8, question 3; Incident plan v0.8, question 2.

### Group 8: Notices and wording that change when processing changes

**Q61.** May the guardian consent screen stay as it is when data about viewing, the automated file check and the proxy (if added) are added, or must it change (and the consent screen version with it)? Must guardians who already consented be told?

- *Why it matters:* A change to the consent screen changes the stored evidence and may need guardians to be told again.
- *Label:* Needed before the documents are signed: it decides the final text of the consent screen.
- *Sources:* Post-media Part C v0.3, question 6; View-data Part C v0.3, question 3; Cloudflare draft v0.3, question 2; Legal copy v0.18, Part C row 32.

**Q62.** Is there a notice duty to the person who uploads about the automated check and the human review, and must the guardian be told? At what level for a child?

- *Why it matters:* Today the uploader sees only a generic rejection; the Policy does not describe the automated check.
- *Label:* Needed before the documents are signed: the Policy and the upload screen contain the wording.
- *Sources:* Post-media addendum v0.6, section 12 question 18; Post-media Part C v0.3, note at line 214 (notice options N-1 to N-5).

**Q63.** Is there a viewer-facing transparency duty for view and dwell data, at what age-appropriate level, and may the in-product text be short and linked to the Policy? Must the child-register wording be shown to every under-18 or only to younger children?

- *Why it matters:* No such notice exists in the app today.
- *Label:* Needed before the documents are signed: it decides whether a notice and wording are added.
- *Sources:* Contest and view-data addendum v0.3, question 11; View-data Part C v0.3, question 1; View-data Part C v0.3, question 2.

**Q64.** May the Policy say 'Contest creators never see who viewed' and 'we do not record how long a viewer looked'? Is describing the 120-second Redis record as 'not stored' accurate?

- *Why it matters:* These sentences are in the draft and each depends on a fact about how the records work.
- *Label:* Needed before the documents are signed: the sentences are in the Policy.
- *Sources:* View-data Part C v0.3, question 4; Contest and view-data addendum v0.3, question 4.

**Q65.** What may the Policy say about automatic approval of a file (no person looks at it), that audio is not checked and that video sampling may miss short content, and which of the review models may it describe?

- *Why it matters:* These facts are true of the built system; the Policy wording is a draft.
- *Label:* Needed before the documents are signed: the Policy states how files are reviewed.
- *Sources:* Post-media Part C v0.3, question 1; Post-media Part C v0.3, question 4; Post-media Part C v0.3, note at line 126 (automatic approval and unchecked audio).

**Q66.** Must the Policy name Amazon Web Services and Cloudflare, give the region of each, and disclose the AWS opt-out?

- *Why it matters:* The check sends a child's file to AWS; the proxy is deferred.
- *Label:* Needed before the documents are signed: the Policy section on processors.
- *Sources:* Post-media Part C v0.3, question 3.

**Q67.** Is the plain wording shown to a person whose file was removed (a generic reason and no detail) adequate, and should it say more for a child or a guardian?

- *Why it matters:* It is the only message the uploader or a guardian receives about a rejected file.
- *Label:* Needed before the documents are signed: the wording is shown on the upload screen.
- *Sources:* Legal copy v0.18, open item 3.

**Q68.** Is 'IP address processed transiently at registration (never stored, no third party)' accurate and sufficient disclosure, and does the proxy (if added) make it untrue?

- *Why it matters:* The Policy says the registration IP is never stored and that no third party receives it; a proxy would see it.
- *Label:* Needed before the documents are signed: the Policy contains the sentence.
- *Sources:* Legal copy v0.18, Part C row 38; Cloudflare draft v0.3, question 10.

**Q69.** The approved restricted-pending wording ('messaged by or send messages to unverified accounts') is looser than what the code does (it blocks sending and hides the account as a recipient). Should it be tightened?

- *Why it matters:* Counsel approved the looser wording earlier; the code is stricter.
- *Label:* Needed before the documents are signed: it is in the Terms.
- *Sources:* Legal copy v0.18, Part C row 27.

**Q70.** Guardian-facing disclosures: the guardian-email change (the restart of the consent request, the notice to the old address), authenticator-app two-factor (what is stored), the email to the minor on approval, and the request summary the consent page shows to a token holder (name and date of birth). Are the disclosures adequate? In particular, is it proportionate to show a minor's full date of birth to whoever holds the single-use guardian link?

- *Why it matters:* Each is built and each shows a guardian or a child something new.
- *Label:* Needed before the documents are signed: the Policy and consent text describe these.
- *Sources:* Legal copy v0.18, Part C row 22; Legal copy v0.18, Part C row 34; Legal copy v0.18, Part C row 44.

**Q71.** Suspension and appeals: is the wording right (an email at once with a short reason from a fixed list and how to appeal; no stated duration; an appeal period of 30 days by default; points are revoked and not restored; guardians 'normally' told)?

- *Why it matters:* Several things are deliberately not stated; counsel may want some of them said.
- *Label:* Needed before the documents are signed: the Terms and Policy contain the sentences.
- *Sources:* Legal copy v0.18, Part C row 53.

### Question-to-source table

Every open item from the eight drafts that is marked A (open for counsel) maps to at least one question below. Items are cited by their document code and number (see section 2).

| Question | Group | Source items |
|---|---|---|
| Q1 | 1 | PA s7 Q1; PC Q7; LC marker 10; LC row 37; DP item 50 |
| Q2 | 1 | PA s7 Q1; PA s7 Q7 |
| Q3 | 1 | PA s7 Q3; IP Q11; IP Q22; LC row 37; PC note 182 |
| Q4 | 1 | PA s7 Q4; LC open 2 |
| Q5 | 1 | PA s7 Q5 (part 5a) |
| Q6 | 1 | IP Q22; PA s12 Q21; LC row 50; DP item 34 |
| Q7 | 1 | PA s12 Q24; LC row 50; DP item 34 |
| Q8 | 2 | PA s12 Q2 |
| Q9 | 2 | PA s12 Q3 |
| Q10 | 2 | PA s12 Q4 |
| Q11 | 2 | PA s12 Q5 |
| Q12 | 2 | PA s12 Q6 |
| Q13 | 2 | PC Q5 |
| Q14 | 3 | LC row 9; LC row 20; DP item 3 |
| Q15 | 3 | IP Q17 |
| Q16 | 3 | PA s12 Q7; PC note 142 |
| Q17 | 3 | PA s12 Q9 |
| Q18 | 3 | CF Q1 |
| Q19 | 3 | CF Q3 |
| Q20 | 3 | CF Q4; PA s12 Q10 |
| Q21 | 3 | CF Q5 |
| Q22 | 3 | CF Q6 |
| Q23 | 3 | CF Q7 |
| Q24 | 3 | CF Q8 |
| Q25 | 4 | CA Q1; VC line 57; CA Q15 |
| Q26 | 4 | CA Q2 |
| Q27 | 4 | CA Q3; CA Q5 |
| Q28 | 4 | CA Q12; LC row 10 |
| Q29 | 4 | CA Q13 |
| Q30 | 4 | CA Q8; CA line 224 |
| Q31 | 4 | CA Q14 |
| Q32 | 4 | CA Q16; DP item 13 |
| Q33 | 4 | LC row 43 |
| Q34 | 5 | DP item 12; DP item 21; CA Q6; CA line 249; PA s12 Q16 |
| Q35 | 5 | PA s12 Q17 |
| Q36 | 5 | LC row 12 |
| Q37 | 5 | LC row 14; DP item 16; LC row 6; LC row 17; DP item 8 |
| Q38 | 5 | LC row 24 |
| Q39 | 5 | LC row 26; DP item 20 |
| Q40 | 5 | LC row 23; LC row 40 |
| Q41 | 5 | LC row 39 |
| Q42 | 5 | DP item 39; DP item 42; IP Q21 |
| Q43 | 5 | PA s12 Q14; PC Q8; PC note 170; PC note 234 |
| Q44 | 5 | CA Q7; CA Q9; CA Q10; CA line 349; VC line 93; VC Q5 |
| Q45 | 6 | IP Q2 |
| Q46 | 6 | IP Q3 |
| Q47 | 6 | IP Q4; DP item 32; LC row 11; LC row 21 |
| Q48 | 6 | IP Q5; IP Q6 |
| Q49 | 6 | IP Q7 |
| Q50 | 6 | IP Q8 |
| Q51 | 6 | IP Q11; IP Q12 |
| Q52 | 6 | IP Q13 |
| Q53 | 6 | IP Q14 |
| Q54 | 6 | IP Q16 |
| Q55 | 6 | CF Q11 |
| Q56 | 6 | IP Q-US1; IP Q-US2; IP Q-US3; IP Q-US4 |
| Q57 | 6 | IP Q-EU1; IP Q-EU2; IP Q-EU3; IP Q-EU4 |
| Q58 | 7 | DP item 23 |
| Q59 | 7 | DP item 28 |
| Q60 | 7 | IP Q3; IP Q2 |
| Q61 | 8 | PC Q6; VC Q3; VC line 118; CF Q2; LC row 32 |
| Q62 | 8 | PA s12 Q18; PC note 214 |
| Q63 | 8 | CA Q11; VC Q1; VC Q2 |
| Q64 | 8 | VC Q4; CA Q4 |
| Q65 | 8 | PC Q1; PC Q4; PC note 126 |
| Q66 | 8 | PC Q3 |
| Q67 | 8 | LC open 3 |
| Q68 | 8 | LC row 38; CF Q10 |
| Q69 | 8 | LC row 27 |
| Q70 | 8 | LC row 22; LC row 34; LC row 44 |
| Q71 | 8 | LC row 53 |

### v1.0 to v1.1 question map

For counsel who has seen v1.0 of this pack.

| v1.0 | v1.1 | Note |
|---|---|---|
| Q1 | Q1 |  |
| Q2 | Q2 |  |
| Q3 | Q3 |  |
| Q4 | Q4 | no longer asks about the 365-day period in public text (#534) |
| Q5 | Q5 | narrowed to part 5a only (staff protection and welfare are the founder HR duty, #533, #534) |
| Q6 | Q6 |  |
| Q7 | Q7 |  |
| Q8 | Q8 |  |
| Q9 | Q9 |  |
| Q10 | Q10 |  |
| Q11 | Q11 |  |
| Q12 | Q12 |  |
| Q13 | Q13 |  |
| Q14 | removed | its source (post-media addendum s12 Q19) is now decided by the founder (B) |
| Q15 | Q14 |  |
| Q16 | Q15 |  |
| Q17 | Q16 |  |
| Q18 | Q17 |  |
| Q19 | Q18 |  |
| Q20 | Q19 |  |
| Q21 | Q20 |  |
| Q22 | Q21 |  |
| Q23 | Q22 |  |
| Q24 | Q23 |  |
| Q25 | Q24 |  |
| Q26 | removed | its source (Cloudflare Q9, which option) is now B (#449, #518) for scope; the remaining acceptability question stays in Q19 to Q25 |
| Q27 | Q25 |  |
| Q28 | Q26 |  |
| Q29 | Q27 |  |
| Q30 | Q28 |  |
| Q31 | Q29 |  |
| Q32 | Q30 |  |
| Q33 | Q31 |  |
| Q34 | Q32 |  |
| Q35 | Q33 |  |
| Q36 | Q34 |  |
| Q37 | Q35 |  |
| Q38 | Q36 |  |
| Q39 | Q37 |  |
| Q40 | Q38 |  |
| Q41 | Q39 |  |
| Q42 | Q40 |  |
| Q43 | Q41 |  |
| Q44 | Q42 |  |
| Q45 | Q43 |  |
| Q46 | Q44 |  |
| Q47 | Q45 |  |
| Q48 | Q46 |  |
| Q49 | Q47 |  |
| Q50 | Q48 |  |
| Q51 | Q49 |  |
| Q52 | Q50 |  |
| Q53 | Q51 |  |
| Q54 | Q52 |  |
| Q55 | Q53 |  |
| Q56 | Q54 |  |
| Q57 | Q55 |  |
| Q58 | Q56 |  |
| Q59 | Q57 |  |
| Q60 | Q58 |  |
| Q61 | Q59 |  |
| Q62 | Q60 |  |
| Q63 | Q61 |  |
| Q64 | Q62 |  |
| Q65 | Q63 |  |
| Q66 | Q64 |  |
| Q67 | Q65 |  |
| Q68 | Q66 |  |
| Q69 | Q67 |  |
| Q70 | Q68 |  |
| Q71 | removed | its source (LC row 18) is now decided by the founder (B) |
| Q72 | Q69 |  |
| Q73 | Q70 | now also carries LC Part C row 22 (guardian request summary), which is open for counsel again |
| Q74 | removed | its source (LC row 35) is now housekeeping (D) |
| Q75 | Q71 |  |

## 4. Strings sheet

These are the 144 on-screen strings that carried the literal tag `[COPY PENDING LEGAL REVIEW]` in `docs/pending-copy-manifest.md` (93 in the web app, 51 in the admin console). **The founder reviewed every one and cleared the tag (R108, 2026-11-22). No counsel review is needed for this sheet.** The rows are kept as a record. The tag is gone from the code and from the manifest, and `npm run check:pending-copy` now passes. One string (S6) was reworded by the founder; its new wording is shown below.

The 56 staff-only admin two-factor strings were cleared earlier, also by the founder (Decision Log #531), and are not in this sheet.

### admin/users/CorrectDobPage.tsx (6 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S1 | Correcting the date of birth re-runs the age-tier checks and can start the guardian flow. You confirm the consequences before anything changes. | Admin Correct Date of Birth, form `6649:24980` (note `6649:25211`) | Cleared by founder review, no counsel review needed |
| S2 | The age-tier checks have been re-run and the correction is in the audit log. If the correction turned an adult account into a minor account, the guardian flow was started. | Admin Correct Date of Birth, success `6649:25721` (note `6649:25951`) | Cleared by founder review, no counsel review needed |
| S3 | The age-tier checks re-run: under-13, under-16 and under-18 flags, the card-verification policy and restrictions. | Admin Correct Date of Birth, confirm dialog `6649:25463` (line 1, `6649:25717`) | Cleared by founder review, no counsel review needed |
| S4 | If this makes an adult account that has never gone through the guardian flow a minor account, the guardian flow starts. | Admin Correct Date of Birth, confirm dialog `6649:25463` (line 2, `6649:25718`) | Cleared by founder review, no counsel review needed |
| S5 | The correction is recorded in the audit log together with your reason. | Admin Correct Date of Birth, confirm dialog `6649:25463` (line 3, `6649:25719`) | Cleared by founder review, no counsel review needed |
| S6 | This correction makes the account a minor and no guardian is on file. We will email the consent request to the guardian at the address you enter below. Use the address from the support ticket. | Admin Correct Date of Birth, Adult To Minor Guardian Details `6752:29980` / Validation `6752:30141` (help line `6752:30127`); wording changed by founder, R108 | Cleared by founder review, no counsel review needed |

### admin/users/IncorrectDetailsReportsPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S7 | A guardian has said the details on a consent request are wrong. While a report is open the guardian cannot approve or start the card payment; they can still decline or withdraw. Resolving a report lets the guardian approve again. No date of birth is shown here. | Admin Incorrect-Details Reports list `6737:27844` (callout `6737:28126`; note `6738:30382`) | Cleared by founder review, no counsel review needed |
| S8 | Resolving clears the report, and the guardian can approve the request again. The action is recorded in the audit log. | Admin Incorrect-Details Reports, Resolve Confirm `6738:30173` | Cleared by founder review, no counsel review needed |

### admin/users/UserDetailPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S9 | This removes @{…} from {…}’s account. | Admin User Detail, Revoke Username Dialog `6647:25789` (body `6647:26050`) | Cleared by founder review, no counsel review needed |
| S10 | Account suspended. The account can no longer sign in and has been emailed. | Admin User Detail, Suspend account result (same sentence as `7042:61998`; no separate user-page frame) | Cleared by founder review, no counsel review needed |

### admin/moderation/holdActions.tsx (8 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S11 | Report #{…}. This holds the reporter’s account in full for 6 months. | Admin Report Detail Bad Faith Confirm `6672:27278` (dialog body `6672:27338`); B-045, Decision Log #398 D1 | Cleared by founder review, no counsel review needed |
| S12 | Report #{…}. This holds both accounts in full until an admin lifts it. | Admin Report Detail Legal Hold Confirm `6672:27349` (dialog body `6672:27409`) | Cleared by founder review, no counsel review needed |
| S13 | The reason is saved to the audit record. | Admin Report Detail Bad Faith Confirm `6672:27278` (help line `6672:27343`) | Cleared by founder review, no counsel review needed |
| S14 | The reason is saved to the audit record. | Admin Report Detail Legal Hold Confirm `6672:27349` (help line `6672:27414`) | Cleared by founder review, no counsel review needed |
| S15 | Reporter acted in bad faith holds the reporter’s account in full for 6 months. Legal hold holds both accounts in full until an admin lifts it. Both ask for confirmation first. | Admin Report Detail Bad Faith Confirm `6672:27278` and Appeal Review Legal Hold Active `6672:29059` (callout `6724:29181`) | Cleared by founder review, no counsel review needed |
| S16 | Report #{…}. Legal hold. Lifting the hold releases both accounts. | Admin Report Detail Lift Hold Confirm `6672:27420` (dialog body `6672:27480`); shown only when the lift releases more than one account | Cleared by founder review, no counsel review needed |
| S17 | The reason is saved to the audit record. | Admin Report Detail Lift Hold Confirm `6672:27420` (help line `6672:27485`) | Cleared by founder review, no counsel review needed |
| S18 | Holds on this report need a child-safety-vetted admin (Settings › Roles). | Admin Report Detail, message report that involves a child, shown instead of the three hold controls to an admin who is not child-safety vetted; no Figma frame (founder-accepted, no design pass); B-308, Decision Log #502 (a) | Cleared by founder review, no counsel review needed |

### admin/moderation/ContactEnquiryDetailPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S19 | Enquiries are deleted automatically 12 months after the last message. If you escalate one, the report’s retention applies instead. | Admin Enquiry Detail `6878:31198` (retention callout); B-046, Decision Log #440, #444 | Cleared by founder review, no counsel review needed |
| S20 | Escalated to report #{…}. That report’s retention applies instead of the 12-month deletion. | Admin Enquiry Detail Escalated `6878:31438` (retention callout); B-046, Decision Log #444 | Cleared by founder review, no counsel review needed |

### admin/moderation/EscalateEnquiryDialog.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S21 | The reason is saved to the audit record. | Admin Enquiry Detail Escalate Dialog `6879:31526` (help line); the same sentence the hold dialogs carry | Cleared by founder review, no counsel review needed |

### web/GuardianConsentConfirmPage.tsx (19 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S22 | Your email address appears on {…}’s profile as their line of contact. | Guardian Consent 4 Web Consent Confirmation `5108:6629`, request summary notice | Cleared by founder review, no counsel review needed |
| S23 | {…}’s photo and username are visible to other Soccernity members. | Guardian Consent 4 Web Consent Confirmation `5108:6629`, request summary notice | Cleared by founder review, no counsel review needed |
| S24 | Report incorrect details | Guardian Consent 4 `5108:6629`, "Report incorrect details" link | Cleared by founder review, no counsel review needed |
| S25 | You told us some of these details are incorrect. Support will review them and contact you, and you can approve once that is done. You can still decline this request below. | No frame draws the approval-on-hold state; wording is this PR's (B-029, Decision Log #372) | Cleared by founder review, no counsel review needed |
| S26 | I confirm I am this account holder’s parent or legal guardian, and I give permission for this account to be activated. | Guardian Consent 4 `5108:6629`, consent checkbox label | Cleared by founder review, no counsel review needed |
| S27 | You can decline up to 3 times. Changing the guardian email does not reset the count. After the third decline the account is scheduled for deletion. | Guardian confirm footnote (replaces "Declining closes the account...", B-130, Decision Log #406 item 13) and the post-decline state; the cap sentence of `5491:8241` addressed to the guardian; Figma `5108:6629` and `6748:29330` / `6748:29450` still carry the old footnote (B-146) | Cleared by founder review, no counsel review needed |
| S28 | You have declined permission for this account, so it stays switched off. | Guardian confirm page, post-decline state (no frame; B-169, Decision Log #408 item 6): the clause is not founder wording, counsel to decide the final text | Cleared by founder review, no counsel review needed |
| S29 | Browse the Sports Hub, including grassroots and pro fixtures. | Guardian Consent 4 `5108:6629`, "What the account holder will be able to do" (QA D-13, B-154: the frame still says "Follow teams and check scores") | Cleared by founder review, no counsel review needed |
| S30 | {…} Please read this before you decide — it explains what the account can do and what we collect. | Guardian Consent 4 `5108:6629` / `5531:7626`, intro under the heading (W9, B-078, B-176). The first sentence is the account holder's first name from the request summary ("{name} named you as their parent or guardian."), or "You were named as the parent or guardian for a new Soccernity account." without a summary | Cleared by founder review, no counsel review needed |
| S31 | Date of birth is used for age checks only. It is never shown publicly. | Guardian Consent 4 `5108:6629`, "What we collect" row 1 (new list, W9, B-078 / B-176; the frame does not tag it, tagged here because it describes data processing for a child) | Cleared by founder review, no counsel review needed |
| S32 | For sign-in and account notices. | Guardian Consent 4 `5108:6629`, "What we collect" row 2 (W9, B-078 / B-176) | Cleared by founder review, no counsel review needed |
| S33 | Profile details, posts, comments and images they upload. | Guardian Consent 4 `5108:6629`, "What we collect" row 3 (W9, B-078 / B-176) | Cleared by founder review, no counsel review needed |
| S34 | Kept only to record that you gave consent, and to contact you about it. | Guardian Consent 4 `5108:6629`, "What we collect" row 4 (W9, B-078 / B-176). Counsel: read next to the "Your email on their profile" section, which says the guardian's email appears on the account holder's profile | Cleared by founder review, no counsel review needed |
| S35 | Recorded on {…}. {…} can now continue registration, with under-18 protections in place. | Guardian Consent 7 Consent Approved (Guardian) `5488:7164` / `5501:8225`, sub-heading (W9, B-079). Replaces the sentence "Your approval has been recorded. The account holder can now continue registration. You can close this page." The date is the moment the confirm call succeeded (the response carries no date) | Cleared by founder review, no counsel review needed |
| S36 | {…} now sets up a profile and picks a club. | Guardian Consent 7 `5488:7164`, "What happens next" row 1 (W9, B-079) | Cleared by founder review, no counsel review needed |
| S37 | You can review or withdraw your consent at any time on the guardian withdrawal page. {…} can share the details from their account. | Guardian Consent 7 `5488:7164`, "What happens next" row 2 (W9, B-079); "guardian withdrawal page" is a link to /guardian-consent/withdraw | Cleared by founder review, no counsel review needed |
| S38 | You don’t need a Soccernity account. It’s safe to close this window now. | Guardian Consent 7 `5488:7164`, "What happens next" row 3 (W9, B-079; the frame does not tag it, tagged here because it makes a statement to a guardian about what is needed from them) | Cleared by founder review, no counsel review needed |
| S39 | This link expires on {…}. | Guardian confirm footnote, sentence 1 (K5 report section 6, B-185); the date is the request's `expiresAt` | Cleared by founder review, no counsel review needed |
| S40 | You can withdraw consent at any time on the guardian withdrawal page. | Guardian confirm footnote, sentence 3 (K5 report section 6, B-185); "guardian withdrawal page" is a link to `/guardian-consent/withdraw` (FC7, Decision Log #415 item 1; page built in FC6, B-112); the link does not change the tagged wording | Cleared by founder review, no counsel review needed |

### web/GuardianConsentPage.tsx (9 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S41 | We’ve emailed a fresh approval request to {…}. | Guardian Consent 10 Approval Request Resent (Minor) `5488:7248` / `5501:8342`, sub-heading (W9, B-079). The frame's second sentence ("The new link is valid for 3 days.") is NOT built: neither the resend response nor the status carries the link lifetime | Cleared by founder review, no counsel review needed |
| S42 | It has a fresh, single-use approval link. The previous link no longer works. | Guardian Consent 10 `5488:7248`, "What happens next" row 1 (W9, B-079) | Cleared by founder review, no counsel review needed |
| S43 | Profile, direct messages and posting stay switched off until they approve. | Guardian Consent 10 `5488:7248`, "What happens next" row 2 (W9, B-079) | Cleared by founder review, no counsel review needed |
| S44 | You can change your guardian’s email address from your account. | Guardian Consent 10 `5488:7248`, "What happens next" row 3 (W9, B-079); followed by a link "Change guardian email" to /guardian-consent/change-email | Cleared by founder review, no counsel review needed |
| S45 | You can still browse the Sports Hub and check scores. | Guardian Consent decline page `5491:8241` (desktop) / `5501:8453` (mobile), "Keep exploring while you wait" (QA D-13: the frame still says "follow teams") | Cleared by founder review, no counsel review needed |
| S46 | Look around the Sports Hub, the Blog and Banter Rooms. Following and posting switch on once your guardian approves. | Restricted Pending `5108:6630` / `5531:7461`, "What you can still do" (QA D-13, B-154: replaces "Browse and follow"; the "Set up your profile / Add your position and photo" row is removed, #377) | Cleared by founder review, no counsel review needed |
| S47 | {…} Continue registration to finish setting up your profile. | Guardian Consent 6 Activation Confirmation `5108:6631`, sub-heading | Cleared by founder review, no counsel review needed |
| S48 | A guardian can decline up to 3 times. Changing your guardian’s email does not reset the count. After the third decline your account is scheduled for deletion. | Guardian Consent decline page `5491:8241` (desktop) / `5501:8453` (mobile), static cap sentence | Cleared by founder review, no counsel review needed |
| S49 | Registration cannot be completed until your guardian approves, including card verification where required. | Restricted Pending `5108:6630` / `5531:7461`, registration status line (Decision Log #367, B-199) | Cleared by founder review, no counsel review needed |

### web/settings/DataExportPage.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S50 | The file contains your personal data. Keep it somewhere safe and don’t share it. | Settings Download my data Ready to download `6991:54653` / `6991:55861` (callout `6991:54893`); B-060, Decision Log #472 (g) | Cleared by founder review, no counsel review needed |

### web/OtherProfilePage.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S51 | Follow to see their profile, posts and activity. | Other User Private, as a non-follower sees it, mobile PV1 `7015:58577` / desktop PV5 `7015:58750` (callout); B-060, Decision Log #472, founder decision 2026-11-08 | Cleared by founder review, no counsel review needed |

### web/profile/PrivateProfileNote.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S52 | Only people who follow you can see your profile. | Own profile, private profile note, mobile PV2 `7015:58666` / desktop PV6 `7015:59532` (line under the bio); B-060, Decision Log #472, founder decision 2026-11-08 | Cleared by founder review, no counsel review needed |

### web/settings/DirectMessagesSettingsPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S53 | When this is on, people you message can see when you’ve read their messages. “Seen” only shows when you and the other person both have read receipts on. | Settings Direct Messages, Read receipts row description, S1 `7012:57260` / S2 `7012:57309` / S3 `7012:57356` / S4 `7012:58176` (mobile S6 to S9); B-061 read receipts, Decision Log #472 | Cleared by founder review, no counsel review needed |
| S54 | This can only make messaging stricter. Our safety rules for under-18s still apply. | Settings Direct Messages, Who can message me, E1 `6981:48879` (all E frames; line `6981:49058`); B-061, Decision Log #472 (i) | Cleared by founder review, no counsel review needed |

### web/twoFactor/CopyTag.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S55 | | The "Copy Tag" chip drawn at the top of every user two-factor frame (B-087 / B-111, Decision Log #397, #446): settings flow `6655:2` / `6655:41` / `6655:85` / `6655:137` / `6655:173`, `6711:26922`, `6711:27117`, `6711:27333`; sign-in prompt `6711:27530`, `6711:27590`, `6711:27617` (mobile twins `6655:27159`..`27322`, `6712:*`); and the lost-device recovery frames (B-278, Decision Log #455, #456): sign-in side 1.1 to 1.5 `6912:34766`..`6913:35173` (`TwoFactorRecoveryRequest.tsx`, the revised prompt and its 2.8 banner), emailed-link pages 2.1 to 2.7 `6914:34766`..`6914:35084` (`RecoveryConfirmPage.tsx`, `RecoveryCancelPage.tsx`) and guardian pages 3.1 to 3.5 `6915:34766`..`6915:34998` (`RecoveryGuardianPage.tsx`); the plain undrawn lines on those screens (recovery unavailable, loading, could not load, something went wrong, and the not-valid copy reused on the guardian page) sit under the same chip. The frames tag the whole screen with one chip rather than each sentence, and so does the code: this ONE component is rendered on each two-factor screen, so every sentence on those screens (setup, key, code, backup codes, turn off, new backup codes, the sign-in code and backup-code prompts and their errors) is pending legal review until counsel clears the wording and the chip is removed | Cleared by founder review, no counsel review needed |

### web/signup/AgeGateStep.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S56 | Thanks for your interest. You need to be at least {…} years old to have a Soccernity account. | Age Gate below-minimum-age `5464:7077` (mobile `5539:7314`), sub-heading | Cleared by founder review, no counsel review needed |
| S57 | Soccernity is built around real grassroots football. In the UK, youth football starts at around age 5–6. Below that, a profile wouldn’t reflect anything about you as a player yet — so we keep signups closed until then, no matter what a parent or guardian agrees to. | Age Gate below-minimum-age `5464:7077` (mobile `5539:7314`), "Why there's an age limit" panel | Cleared by founder review, no counsel review needed |

### web/signup/GuardianDetailsStep.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S58 | We only use this email address to request and record consent. | Guardian Details Capture `5108:6627` (mobile `5539:7354`), fineprint `5111:6669` | Cleared by founder review, no counsel review needed |

### web/CreateProfilePage.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S59 | Set when you signed up and cannot be changed here. | Create Profile `1498:2303` / `1629:2449`, read-only date of birth note (K6 / Decision Log #394) | Cleared by founder review, no counsel review needed |

### web/src/components/block/BlockUserDialog.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S60 | You can undo it at any time in Settings; unblocking does not restore follows. They are not told. | Block confirmation `6655:29600` / `6655:27355` (closing sentence; Decision Log #396, #402 item 4); moved from OtherProfilePage.tsx when B-067 shared the dialog with the messaging screens | Cleared by founder review, no counsel review needed |

### web/messages/actions/messageActionRules.ts (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S61 | We may keep a copy of the original for safety and legal reasons. | Message Delete For Everyone Confirm `6978:47233` (mobile), `6979:48119` (desktop), also Deleting `6978:47338` / `6979:48323`; B-067, Decision Log #472 (b) | Cleared by founder review, no counsel review needed |

### web/src/components/report/ReportContextStep.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S62 | Our safeguarding team will see the messages you choose, and the message you are reporting. | Report a message, Add messages for context, desktop `7025:60129` to `7027:59171` and mobile `7025:59162` to `7027:59162` (callout under the subtitle); B-286, Decision Log #477 | Cleared by founder review, no counsel review needed |

### web/profile/EditProfileModal.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S63 | Shown on your profile only if you fill it in. It does not change the country used for safeguarding. | Edit Profile `1466:15934` / `5702:8317`, Country hint (Decision Log #403 item 17) | Cleared by founder review, no counsel review needed |
| S64 | Set when you signed up and cannot be changed here. | Edit Profile `1466:15934` / `5702:8317`, read-only date of birth note (Decision Log #367) | Cleared by founder review, no counsel review needed |

### web/profile/ProfileImageControl.tsx (4 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S65 | Only you can see this picture until it has been checked. | Avatar, under review state (K6 pass, Decision Log #371, #411 item 1) | Cleared by founder review, no counsel review needed |
| S66 | Only you can see this cover photo until it has been checked. | Cover photo, under review state (K6 pass, Decision Log #411 item 4) | Cleared by founder review, no counsel review needed |
| S67 | Pictures are checked automatically before they appear on your profile. | Avatar, note under the control (K6 pass) | Cleared by founder review, no counsel review needed |
| S68 | Cover photos are checked automatically before they appear on your profile. | Cover photo, note under the control (K6 pass) | Cleared by founder review, no counsel review needed |

### web/settings/BlockedUsersPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S69 | You can unblock someone at any time. Unblocking does not restore follows. | Blocked users list `6705:26172` / `6706:26580`, lead line (Decision Log #396) | Cleared by founder review, no counsel review needed |
| S70 | They will be able to see your posts again, and you will see theirs. Follows that were removed when you blocked them are not restored. | Unblock confirmation `6705:26659` (body; Decision Log #396) | Cleared by founder review, no counsel review needed |

### web/guardian-consent/GuardianWithdrawalPage.tsx (9 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S71 | Enter the email address of the Soccernity account you gave consent for. We will send a withdrawal link to the guardian email on that account. | Guardian Withdrawal 1 Request `6654:2` (mobile `6654:26727`), sub-heading | Cleared by founder review, no counsel review needed |
| S72 | If that account has confirmed guardian consent, a withdrawal link has been sent to the guardian. The link can be used once. | Guardian Withdrawal 2 Request Sent `6654:30` (mobile `6654:26755`), sub-heading | Cleared by founder review, no counsel review needed |
| S73 | Nothing has changed yet. Consent is only withdrawn when the guardian confirms from the link. | Guardian Withdrawal 2 Request Sent `6654:30`, info panel `6654:50` | Cleared by founder review, no counsel review needed |
| S74 | Withdrawing consent closes the account straight away. This cannot be undone from this page. | Guardian Withdrawal 3 Confirm `6654:57` (pre-filled `6820:29312`; mobile `6654:26782` / `6820:29346`), sub-heading | Cleared by founder review, no counsel review needed |
| S75 | The account is closed and the person can no longer sign in. | Guardian Withdrawal 3 Confirm `6654:57`, card `6654:82` line 1 | Cleared by founder review, no counsel review needed |
| S76 | The details they entered are deleted after 30 days. | Guardian Withdrawal 3 Confirm `6654:57`, card `6654:82` line 2 (the 30-day sentence is the counsel inconsistency of Decision Log #411 item 7, B-200) | Cleared by founder review, no counsel review needed |
| S77 | Your withdrawal has been recorded and the account has been closed. | Guardian Withdrawal 4 Success `6654:91` (mobile `6654:26816`), sub-heading | Cleared by founder review, no counsel review needed |
| S78 | The details they entered are deleted after 30 days. | Guardian Withdrawal 4 Success `6654:91`, card `6654:111` line 1 (as above, B-200) | Cleared by founder review, no counsel review needed |
| S79 | We have emailed the account holder to tell them. | Guardian Withdrawal 4 Success `6654:91`, card `6654:111` line 2 | Cleared by founder review, no counsel review needed |

### web/community/FinalWeekCarousel.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S80 | Finalists appear in a different order for each viewer. The order is never based on likes, comments, ranking, follower count or when a video was uploaded. | Community feed "Final week" carousel, component sets `6697:26234` / `6697:27448` (transparency sentence, as drawn; frames `6661:26929` / `6661:29200`) | Cleared by founder review, no counsel review needed |

### web/community/PostCard.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S81 | Engagement is locked until the reveal. Only you can see this entry until then. | Pinned final entry on the finalist's own profile, before the reveal, `6707:26727` (desktop) / `6709:26922` (mobile) | Cleared by founder review, no counsel review needed |

### web/community/MediaUploadTray.tsx (4 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S82 | Checking… only you can see this until it has been checked. | Create Post composer 03 / 04 Checking `6847:29794` / `6847:29860` / `6848:29780` / `6848:29839`; contest final entry 03 `6850:29769` / `6850:30027` | Cleared by founder review, no counsel review needed |
| S83 | Your video is hidden from everyone but you until the reveal at 00:00 on day 25. | Contest final entry 04 Approved, waiting for the reveal `6850:29820` / `6850:30084` | Cleared by founder review, no counsel review needed |
| S84 | Your video can be seen with your post. | Video variant of composer 05 Approved (no frame; the pictures wording is `6847:29922` / `6848:29894`) | Cleared by founder review, no counsel review needed |
| S85 | Your pictures can be seen with your post. | Create Post composer 05 Approved `6847:29922` / `6848:29894` | Cleared by founder review, no counsel review needed |

### web/community/PostMedia.tsx (5 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S86 | Only you can see this post until its video has been checked. | Video variant of the author post card, media under review (no frame; the pictures wording is `6849:29675` / `6849:29769`) | Cleared by founder review, no counsel review needed |
| S87 | Only you can see this post until its pictures have been checked. | Author post card, media under review `6849:29675` / `6849:29769` | Cleared by founder review, no counsel review needed |
| S88 | Only our moderators see your reason, not the person who posted this. | Report on media, reason field (frontend/fc10-followups, B-260). Figma frames exist since pass R and pass S; the sentence is the layer `[COPY PENDING LEGAL REVIEW] Hint` (characters without the tag, as the other tagged Figma lines) directly under the reason field on desktop `6849:30010`, `6858:30609`, `6858:30622`, `6858:30635` and mobile `6849:30169`, `6858:30685`, `6858:30698`, `6858:30711` | Cleared by founder review, no counsel review needed |
| S89 | Your post stays hidden from other people until every video has been approved. Remove this video or choose another. | Video variant of the author post card, media rejected (no frame; the pictures wording is `6849:29719` / `6849:29813`) | Cleared by founder review, no counsel review needed |
| S90 | Your post stays hidden from other people until every picture has been approved. Remove this picture or choose another. | Author post card, media rejected `6849:29719` / `6849:29813` | Cleared by founder review, no counsel review needed |

### web/community/FinalWeekPanel.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S91 | Everything you upload is checked before it can be shown, and your video stays hidden from everyone but you until the reveal. | Contest final entry 01 Choose a video, desktop `6850:29675` / mobile `6850:29921` | Cleared by founder review, no counsel review needed |

### admin/media-review/MediaReviewItemPage.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S92 | Say why this {…} is being rejected. The uploader sees this reason. | Admin media review, Reject dialog `6852:30985` / `6852:31327`, and for a profile picture / cover photo `6972:46863` / `6972:47057` / `6972:47248` (the frames say "picture" or "profile picture"; the code names the file type: picture, video, profile picture or cover photo) | Cleared by founder review, no counsel review needed |

### web/ContactPage.tsx (3 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S93 | Our support team reads the messages sent through this form. We keep your message for 12 months after the last message in the enquiry and then delete it automatically; if it raises a safeguarding concern or a complaint, it may be kept for longer as part of a report or case record. See our Privacy Policy. | Contact Us form notice: `Notice — Contact Us form` on `6113:14053`, `6113:14199`, `6115:14611`, `6115:14684` and the form-state frames (`6887:32445` desktop, `6887:32453` mobile); source `docs/legal-copy-draft-tos-privacy-policy.md` Part C, "Screen copy -- Contact Us form notice"; one chip covers both sentences; first sentence is the exact v0.11 wording (founder decision 2026-10-30, not counsel’s); B-046, B-047, Decision Log #440, #444, #445 | Cleared by founder review, no counsel review needed |
| S94 | Appeal a suspension | Contact Us category dropdown option, last of seven (`6130:14653` / `6130:14664`, Figma pass V); B-298, B-301, Decision Log #492, #497. Public web page only: the admin inbox label in apps/admin is not tagged | Cleared by founder review, no counsel review needed |
| S95 | Use the email address your Soccernity account is registered with so we can find it. | Contact Us helper line, shown only while Appeal a suspension is chosen, with its visible tag chip: `7050:63556` / `7050:63739` / `7050:64028` / `7050:64123` (Figma pass V); B-298, B-301 | Cleared by founder review, no counsel review needed |

### admin/users/GuardianNoticesSection.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S96 | | The "Copy Tag" chip at the top of the Guardian notices card in every state: OFF `6920:34766`, ON `6921:35255`, ON review due `6921:35449`, cleared `6921:36121`, no confirmed guardian `6921:36281`. The frames tag the whole card with one chip, so this ONE component covers every card string (title, pills, the vetted-only line, the OFF explanation, the Withholding callout, the review-due note, Set by / Set on / Last reviewed, the reason and review-note labels, the no-guardian hint, the Withhold, Record review and Clear buttons and the section's load-error line); the dialogs and the banner carry their own inline tags below | Cleared by founder review, no counsel review needed |

### admin/users/guardianNoticesCopy.ts (8 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S97 | Consent emails (consent request, withdrawal, expiry, turned-18 notice, guardian-email-replaced) are not affected. | Set dialog `6921:34878` (third bullet; the frame tags the end of the bullet block) | Cleared by founder review, no counsel review needed |
| S98 | The reason is saved to the audit record. | Set dialog `6921:34878` and `6921:35065` (help line); the same sentence the hold dialogs carry | Cleared by founder review, no counsel review needed |
| S99 | {…} is under 18 and has no confirmed guardian yet. While this is on: | No frame: the set dialog's intro for an account with no confirmed guardian (frame `6921:34878` draws only the confirmed-guardian intro; frame `6921:36281` draws the button) | Cleared by founder review, no counsel review needed |
| S100 | Confirm that withholding guardian notices for {…} should continue. Your note is saved to the audit record. | Record review dialog `6921:35655` | Cleared by founder review, no counsel review needed |
| S101 | Guardian notices for {…} will be sent as normal from now on. Notices that were skipped while this was on will not be sent. | Clear dialog `6921:35894` | Cleared by founder review, no counsel review needed |
| S102 | Guardian notices for {…} are sent as normal again. Notices skipped while this was on will not be sent. The action was recorded. | Cleared banner `6921:36121` | Cleared by founder review, no counsel review needed |
| S103 | Enter between 10 and 1000 characters. | No frame: the line shown when the server refuses the reason or note length (400 `guardian_notices_text_invalid`); the frames draw only the empty-reason error `6921:35065` | Cleared by founder review, no counsel review needed |
| S104 | Another admin changed guardian notices for this account while this page was open. It now shows the current state. | No frame: the line shown after a 409 `guardian_notices_already_withheld` / `guardian_notices_not_withheld` (a stale page) | Cleared by founder review, no counsel review needed |

### web/profile/usernameReviewCopy.ts (11 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S105 | Your username was removed by Soccernity. | Create Profile Username Review 01 Entry `6956:44591` (card line 1; the frame also names the handle, omitted: not in the response) | Cleared by founder review, no counsel review needed |
| S106 | You can choose a new username below, or ask for a review of the removal. You can ask once, within 30 days of the removal. | Create Profile Username Review 01 Entry `6956:44591` (card line 2) | Cleared by founder review, no counsel review needed |
| S107 | A different member of our team reviews your request. Their decision is final. | Create Profile Username Review 02 Request Form `6956:44790` (note `6956:44986`) | Cleared by founder review, no counsel review needed |
| S108 | We’ll show the result here and send you a notification when it’s decided. | Create Profile Username Review 04 Request Sent `6956:45202` (`6956:45397`) | Cleared by founder review, no counsel review needed |
| S109 | You asked for a review. Our team is looking at it. | Create Profile Username Review 05 Pending `6956:45402` (`6956:45596`; the frame also gives the request date, omitted: not in the response) | Cleared by founder review, no counsel review needed |
| S110 | The result will appear here, and you will get a notification. | Create Profile Username Review 05 Pending `6956:45402` (`6956:45597`) | Cleared by founder review, no counsel review needed |
| S111 | Our team decided to keep the username removed. The decision is final and cannot be reviewed again. | Create Profile Username Review 07 Declined `6956:45803` (`6956:45997`) | Cleared by founder review, no counsel review needed |
| S112 | Choose a new username below to continue. | Create Profile Username Review 07 Declined `6956:45803` (`6956:45998`) and 08 Window Passed `6956:46003` (`6956:46195`) | Cleared by founder review, no counsel review needed |
| S113 | The time to ask for a review has passed. | Create Profile Username Review 08 Window Passed `6956:46003` (`6956:46194`; shown after the server answers 403 `username_review_window_closed`; the frame also names the handle and removal date, omitted: not in the response) | Cleared by founder review, no counsel review needed |
| S114 | Couldn’t send your request. Check your connection and try again. | Create Profile Username Review 09 Error Could Not Send `6956:46200` (`6956:46399`) | Cleared by founder review, no counsel review needed |
| S115 | You’ve already asked for a review of this removal. The result will appear here. | Create Profile Username Review 10 Error Already Asked `6956:46409` (`6956:46608`) | Cleared by founder review, no counsel review needed |

### web/notifications/usernameReviewCopy.ts (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S116 | Your username is back on your account. | Notification Centre Username Review Outcomes `6956:46618` (approved row `6956:47008`; the frame names the handle, omitted: the notification carries only the outcome) | Cleared by founder review, no counsel review needed |
| S117 | The username stays removed. | Notification Centre Username Review Outcomes `6956:46618` (decided row `6956:47027`) | Cleared by founder review, no counsel review needed |

### web/settings/AccountInformationPage.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S118 | Set when you signed up and cannot be changed here. | Settings Account Information `6989:49962` / `6989:50344` (note `6989:50153`) | Cleared by founder review, no counsel review needed |

### web/settings/ChangeEmailPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S119 | We’ve also told your current address about this change. | Email change Check your inbox `6990:50994` / `6990:51906` (callout `6990:51176`), under 18 `6990:51182` / `6990:51948` (callout `6990:51364`) | Cleared by founder review, no counsel review needed |
| S120 | Your guardian will be told about this change. | Email change Check your inbox (under 18) `6990:51182` / `6990:51948` (callout `6990:51367`) | Cleared by founder review, no counsel review needed |

### web/settings/PushNotificationsPage.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S121 | Push notifications only say “You have a new notification”. Open Soccernity to see what it is. | Settings Push On `6990:54293` / `6990:55818`, Off `6990:54466` / `6990:55850` (callout `6990:54462` / `6990:54635`) | Cleared by founder review, no counsel review needed |

### web/src/components/removed/removedContent.ts (3 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S122 | This message was removed by Soccernity | Message removed by Soccernity M1 `7034:59391`, M2 `7034:59438`, inbox preview M3 `7034:59485`, desktop D1 `7034:59555`, D2 `7034:59758`; B-289, Decision Log #483 | Cleared by founder review, no counsel review needed |
| S123 | This comment was removed by Soccernity | Removed comment M4 `7035:59629`, D3 `7035:59818`; B-289, Decision Log #483 | Cleared by founder review, no counsel review needed |
| S124 | Soccernity removed this post. | Removed post notice for its author M5 `7035:59686`, D4 `7035:59699`; B-289, Decision Log #483 | Cleared by founder review, no counsel review needed |

### admin/moderation/SuspendAccountDialog.tsx (8 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S125 | They can’t sign in, and every session they have ends now. | Admin Suspend Account Dialog, report `7042:61915` (consequence list, line 1) and user page `7045:63231`; B-295, B-301, Decision Log #485, #497 | Cleared by founder review, no counsel review needed |
| S126 | Engagement points they earned from views, likes and comments are removed. | Admin Suspend Account Dialog `7042:61915` / `7045:63231` (line 2) | Cleared by founder review, no counsel review needed |
| S127 | If they are under 18, their guardian is told once. | Admin Suspend Account Dialog `7042:61915` / `7045:63231` (line 3) | Cleared by founder review, no counsel review needed |
| S128 | They are emailed straight away with a short reason based on this report’s category, and told how to appeal through the Contact Us page. For Child safety concern, Other, or no category the reason is “breaching our community rules”. The email names no reporter and no duration. | Admin Suspend Account Dialog, report mode `7042:61915` (line 4) | Cleared by founder review, no counsel review needed |
| S129 | They are emailed straight away with a short reason based on the category you choose, and told how to appeal through the Contact Us page. The email names no reporter and no duration. | Admin Suspend Account Dialog, user-page mode `7045:63231` (line 4) | Cleared by founder review, no counsel review needed |
| S130 | If an appeal against this report is overturned, the account is reinstated automatically. | Admin Suspend Account Dialog, report mode `7042:61915` (line 5) | Cleared by founder review, no counsel review needed |
| S131 | A moderator reviews appeals sent through Contact Us and can reinstate the account from this page. | Admin Suspend Account Dialog, user-page mode `7045:63231` (line 5) | Cleared by founder review, no counsel review needed |
| S132 | The email gives a short reason based on this choice. For Child safety concern and Other it says “breaching our community rules”. | Admin Suspend Account Dialog, user-page mode `7045:63231` (category help line) | Cleared by founder review, no counsel review needed |

### admin/moderation/RecordAppealDialog.tsx (3 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S133 | Record an appeal for the suspended person against the decision on Report #{…}. They can’t sign in, so staff record it for them. | Admin Record an Appeal `7044:62187` (and `7044:62269`, `7044:62352`, `7044:62425`), paragraph 1; B-295, B-301, Decision Log #485 (f), #492 | Cleared by founder review, no counsel review needed |
| S134 | This is only possible inside the appeal window, counted from the decision. Recording it pauses closure of this report until the appeal is decided. | Admin Record an Appeal `7044:62187`, paragraph 2 | Cleared by founder review, no counsel review needed |
| S135 | The reason is saved to the audit record. | Admin Record an Appeal `7044:62187` (help line under the reason box); the same sentence the hold dialogs carry | Cleared by founder review, no counsel review needed |

### admin/media-review/SetAsideDialog.tsx (4 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S136 | The {…} is withdrawn from public view and rejected. The uploader sees the standard rejection message. | No Figma frame (B-206 suspected illegal imagery, backend PR #800); DEFAULT wording, founder-veto-able | Cleared by founder review, no counsel review needed |
| S137 | The {…} is kept for the set-aside period and is not deleted with the uploader’s account. | No Figma frame (B-206 suspected illegal imagery, backend PR #800); DEFAULT wording, founder-veto-able | Cleared by founder review, no counsel review needed |
| S138 | Nothing is reported to anyone. A report to a receiving body is made outside Soccernity, and you record it afterwards. | No Figma frame (B-206 suspected illegal imagery, backend PR #800); DEFAULT wording, founder-veto-able | Cleared by founder review, no counsel review needed |
| S139 | 10 to 500 characters. The reason is saved with the record and is never shown to the uploader. | No Figma frame (B-206 suspected illegal imagery, backend PR #800); DEFAULT wording, founder-veto-able | Cleared by founder review, no counsel review needed |

### admin/suspected-illegal/SuspectedIllegalDetailPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S140 | These suggestions are pending counsel. None of them is approved or confirmed. | No Figma frame (B-206 suspected illegal imagery, backend PR #800); DEFAULT wording, founder-veto-able | Cleared by founder review, no counsel review needed |
| S141 | A report to a receiving body must be made with that body, outside Soccernity. This page does not send anything. It only records that a report was made, or that it was decided not to make one. | No Figma frame (B-206 suspected illegal imagery, backend PR #800); DEFAULT wording, founder-veto-able | Cleared by founder review, no counsel review needed |

### admin/moderation/ReportDetailPage.tsx (2 strings)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S142 | Account suspended. The account can no longer sign in and has been emailed. | Admin Report Detail, suspended result state `7042:61998` | Cleared by founder review, no counsel review needed |
| S143 | Appeal recorded for the account. It is waiting for review, and closure of this report is paused. | Admin Report Detail, appeal recorded state (Record an Appeal, recorded `7044:62498`) | Cleared by founder review, no counsel review needed |

### admin/moderation/ContextMessagesCard.tsx (1 string)

| # | String as shown | Figma frame | Status |
|---|---|---|---|
| S144 | Context hidden: this involves a child. | Admin Report Detail, hidden message context `7045:62777`; B-293, B-295, Decision Log #486, #497 | Cleared by founder review, no counsel review needed |

## 5. Sign-off

This table is intentionally blank. Nothing in this pack has been signed.

| Document | Version | Reviewed by | Date | Outcome | Notes |
|---|---|---|---|---|---|
| Legal copy | v0.23 | | | | |
| DPIA | v0.15 | | | | |
| Incident plan | v0.13 | | | | |
| Post-media addendum | v0.11 | | | | |
| Post-media Part C | v0.7 | | | | |
| Contest and view-data addendum | v0.7 | | | | |
| View-data Part C | v0.7 | | | | |
| Cloudflare draft | v0.6 | | | | |
| Strings sheet (section 4) | 144 strings, cleared by founder review (R108), no sign-off needed | | | | |
| Questions Q1 to Q71 (section 3) | answered: yes / no | | | | |
