# Soccernity — Draft for counsel: Cloudflare edge proxy — processor list, cross-border assessment and DPIA R11

## DRAFT FOR COUNSEL REVIEW — NOT APPROVED, NOT LEGAL ADVICE, NOT A COMPLETED DPIA

**Status: draft for counsel review. [COPY PENDING LEGAL REVIEW]**

This is a **new, standalone file** in the style of `docs/dpia-addendum-post-media-draft.md` and
`docs/legal-copy-part-c-post-media-draft.md`. It does **not** edit `docs/legal-copy-draft-tos-privacy-policy.md`
(v0.11), `docs/sprint-1-dpia-outline-draft.md` (v0.3), the register or the Build Plan. If counsel accepts any of it,
applying it is a separate step for whoever maintains those files.

Produced by Claude Code in the `safeguarding-drafter` role (CLAUDE.md non-negotiable #2: every output is a draft,
never approved). Nothing here says Soccernity, Cloudflare or any transfer complies with UK GDPR, EU GDPR, COPPA, the
Nigeria Data Protection Act 2023 (NDPA) or any other regime. **Every section below is a draft for counsel review — not
approved, not legal advice.** The sign-off block in Section 12 is empty on purpose.

**Tag convention.** Proposed wording carries `[COPY PENDING LEGAL REVIEW]`. **[PROPOSAL]** = a suggestion for counsel
to confirm, revise or reject. **[OPEN]** = belongs to the founder or counsel; this draft does not decide it.
**[UNVERIFIED, FOR COUNSEL]** = a claim about Cloudflare, Render or a law that this draft could not confirm from a
primary source (the reason is given each time).

- **Draft date:** 2026-11-01. **Version:** 0.1 (draft, NOT APPROVED).
- **Decision Log:** #449 (adopted 2026-10-31: free-plan Cloudflare proxy in front of the API and the two static sites,
  with an origin lock; built at the launch gate), #424 (the original recommendation), #437 (DNS records stay
  "DNS only" until then), #429 (re-verify `TRUST_PROXY_HOPS`), #4 (scope: UK, Nigeria, US, EU).
- **Register:** B-251 (edge protection), with B-249, B-256, B-267 (b), B-090, B-265.
- **Nothing here is live.** No Cloudflare account, domain, DNS record or deployment exists. The proxy is built at the
  launch gate (B-090). Everything about Cloudflare below is from its public documents as retrieved on 2026-11-01.

---

## 0. Read this first: six things counsel should know **[COPY PENDING LEGAL REVIEW]**

1. **A proxy that terminates TLS is not an "IP address" tool.** Every request and response for the proxied
   hostnames is decrypted at Cloudflare's edge so Cloudflare can apply its services (this follows from Cloudflare's
   own description of the encryption modes — Section 3.3). For Soccernity that includes sign-in passwords, two-factor
   codes, session and refresh cookies, dates of birth at registration, guardian-consent tokens, minors' posts and
   messages, and the admin console's reads of dates of birth. Cloudflare's own DPA says the extent of personal data in
   customer content, including special categories, "is determined and controlled by the Customer" (Section 3.2).
2. **Cloudflare is already in the legal draft — for storage only.** PP §5 already lists "Cloudflare (R2 object
   storage)" (Decision Log #307). The proxy is a **second, much wider role** with the same company. The existing
   entry does not cover it, and the existing "which processors" and cross-border rows do not mention Cloudflare at all.
3. **The draft policy makes statements the proxy would make untrue.** PP §1.7 and §1.8 say the registration IP address
   is read in memory, "never stored or logged", and that "no third party receives the IP address"; PP §5 (MaxMind)
   repeats "No IP address is sent to MaxMind or anyone else". With the proxy, Cloudflare receives every visitor's IP
   address on every request and can log it. Section 8.3 lists these statements. (Render, which already hosts the API,
   necessarily sees IP addresses at its load balancer too; the draft's wording is already narrower than the facts.
   Counsel may want this fixed whether or not the proxy is adopted.)
4. **The free plan gives Soccernity no control over where Cloudflare processes the traffic.** Cloudflare's tools for
   limiting where traffic is decrypted (Regional Services) and where logs are kept (Customer Metadata Boundary) are
   documented as Enterprise-only (Section 4). Its own privacy policy says it "primarily" stores data in the US and the
   EEA, and its network is in "over 330 cities across 100+ countries" (Section 4). Whether the DPA binds a Free-plan
   account without an extra step is **not confirmed** (Section 5).
5. **Nigeria is a separate analysis from the UK and EU.** The NDPA's transfer rules and the NDPC's GAID 2025 were
   read from the official PDFs for this draft (Section 6.2). Nothing in the UK/EU transfer tools Cloudflare cites
   (UK Addendum, Data Privacy Framework) is an NDPC-approved instrument that this draft could find.
6. **The founder has adopted the proxy (#449).** This draft does not reopen that. It records what counsel's answers
   could change (Section 7) and the technical consequences counsel should know (Section 9).

---

## 1. Scope and facts **[COPY PENDING LEGAL REVIEW]**

### 1.1 What is decided and what is not

| Item | State |
|---|---|
| Free-plan Cloudflare proxy in front of the API, `apps/web` and `apps/admin` static sites | Adopted (#449); **not built**; built at the launch gate |
| Origin lock (Render origin accepts only the proxy) | Adopted (#449); **mechanism not designed** (Section 9.2) |
| DNS records | "DNS only" (not proxied) until the build (#437) |
| Which traffic Cloudflare sees | Everything sent to the proxied hostnames, in both directions |
| Cloudflare R2 (stored media) | Already planned (#307); separate role (Section 2.2) |
| Production domains | `soccernity.com`, `admin.soccernity.com`, `api.soccernity.com` and the staging equivalents (#437) |

### 1.2 What would pass through the proxy (from the repo)

Read from `services/api` and `apps/web`/`apps/admin` on `origin/main`. "Through the proxy" assumes all three
hostnames are proxied (option A, Section 7).

| Traffic | Where it appears | Sensitivity for counsel |
|---|---|---|
| Sign-in: email and password in the request body; two-factor codes | `POST /auth/login`, `/auth/login/two-factor`, `/admin/auth/login*` | Credentials; for children's accounts too |
| Access token (`Authorization` header) and the httpOnly refresh cookies `sn_rt`, `sn_admin_rt` | every authenticated call; `/auth/refresh`, `/admin/auth/refresh` | Session takeover value |
| Registration: name, email, date of birth, declared country | `POST /auth/register` | A date of birth is encrypted at rest (B-252, key rotation B-272); in transit it is plaintext inside TLS, visible at the edge |
| Guardian details and consent tokens (a header, `X-Consent-Token`; a body token) | `/auth/guardian-consent*` | A child's name and a guardian's contact details; the token is the credential |
| Posts, comments, messages, Banter posts, profile fields (bio, preferred club, profile country), reports | the feed, messaging, user and moderation routes | Minors' content and other users' content |
| Avatar and cover uploads, admin media uploads (multipart through the API) | `POST /users/:id/avatar`, `/cover`, `POST /admin/media/upload` | Minors' images, **before** the image check |
| Admin console reads: user detail, date-of-birth read and correction, held investigations, report details | `/admin/*` | Staff reading children's data; moderation of illegal content |
| Static sites: page requests, the JS bundle | `apps/web`, `apps/admin` hostnames | IP, user agent, pages visited |
| Visitors' IP address and request metadata | every request | Persistent identifier (COPPA context — Section 6.3) |

**Not through the proxy even with all three hostnames proxied** (from the code, not from Cloudflare): the browser's
upload to the media bucket uses a presigned link to the object store directly (the W14 pipeline), and card details go
from the browser to Stripe directly (`CardVerificationPanel`; the API stores only a PaymentIntent reference). If the
public media address is later put behind a Cloudflare custom domain (B-265, `S3_PUBLIC_BASE_URL`), media *viewing*
would pass through the same Cloudflare. **[OPEN]**

### 1.3 The Render question **[UNVERIFIED, FOR COUNSEL]**

A Render article ("How Render handles DDoS attacks", `https://render.com/articles/how-render-handles-ddos-attacks`)
was returned by search as saying that all inbound traffic to Render web services already passes through Cloudflare's
global network. This draft did not open that page and did not retrieve Render's sub-processor list. If it is true,
Cloudflare may **already** be in the path as Render's sub-processor, and the proxy would add a second, direct
relationship rather than a first. Whoever prepares the processor list should check Render's sub-processor page.

---

## 2. Roles **[COPY PENDING LEGAL REVIEW]**

### 2.1 Cloudflare as processor, and where it says it is a controller

- Cloudflare's privacy policy (effective 4 November 2025), Section 6: "Cloudflare is a data controller for the personal
  information collected from all categories of data subjects listed above, with the following exceptions: Cloudflare is a
  data processor of Customer Logs, Administrative User Audit Logs, and some account settings information. In addition,
  Cloudflare is a data processor for any of the content provided by Customers and End Users through the Services that
  transits, or in some cases, is stored on, the Cloudflare network." (`https://www.cloudflare.com/privacypolicy/`;
  the page was read through a tool that returned verbatim text only to about Section 14.)
- The DPA (Version 6.4, effective 3 April 2026) applies "where Cloudflare processes Personal Data as a Processor (or
  sub-Processor as applicable) on behalf of Customer"; its controller activities are outside it
  (`https://www.cloudflare.com/cloudflare-customer-dpa/`, and the PDF of the same version, read in full).
- "Customer Logs" means "any logs of End Users' interactions with Customer's Internet Properties and the Service" made
  available through the dashboard (DPA Annex 1, Part B). End Users are people who "access or use Customer's domains,
  networks, websites, application programming interfaces". Annex 1 lists "Any Personal Data processed in Customer Logs,
  such as IP addresses".
- Cloudflare says it "has no direct relationship with End Users" (privacy policy, Section 8), so Soccernity, as
  controller, would be the party answering a child's or guardian's questions about Cloudflare.

**Questions (Section 11):** Q1 (roles, including the "Network Data" gap — the policy's role for it is not stated),
Q2 (whether Soccernity is controller for the proxied traffic of every user group, and what the guardian is told).

### 2.2 The existing R2 role

The R2 entry in PP §5 is a processor role for stored files. The proxy is a separate service under the same DPA and
account, and the same Cloudflare entity. Counsel may prefer one Cloudflare entry with two purposes (Section 8.1) or
two entries.

### 2.3 Cloudflare's own statement on children

The privacy policy, Section 1: "Cloudflare's Websites and Services are not intended for, nor designed to attract,
individuals under the age of eighteen. Cloudflare does not knowingly collect or share personal information from any
person under the age of eighteen." This is about Cloudflare's own sites and direct users, not End Users of a customer.
The DPA text read for this draft contains **no statement about children** in the processing description. Soccernity
will send children's data through the service regardless. **[OPEN: Q3]**

---

## 3. What Cloudflare would process **[COPY PENDING LEGAL REVIEW]**

### 3.1 Categories (Cloudflare's own description)

Annex 1 of the DPA lists, for End Users, personal data in Customer Logs "such as IP addresses", and for Customer Content
"Any Personal Data processed in Customer Content, the extent of which is determined and controlled by the Customer in
its sole discretion". It also says: "Customer, its End Users, Administrators, and/or other partners may upload content
to Customer's online properties which may include special categories of data … information revealing racial or ethnic
origins, political opinions, religious or philosophical beliefs, trade-union membership, and the processing of data
concerning an individual's health or sex life." Frequency is "Continuous for the duration of the Main Agreement."

The Cloudflare GDPR page says that for its "Core Application Layer Services, Cloudflare does not store customer content",
and that log metadata (including IP addresses) is processed "on behalf of our customers" "for a limited period of time"
(`https://www.cloudflare.com/trust-hub/gdpr/`; page undated). No figure is given. **[UNVERIFIED, FOR COUNSEL: whether
anything about a request body is kept beyond the request, and for how long.]**

### 3.2 Special categories and children's data in Soccernity's own traffic

The platform's content can include health information (injury posts), religion, ethnicity and similar in free text, and
the grassroots module screens for exactly these (`sensitive-content` module, Decision Log #366). Those would transit the
proxy. Nothing in the product encrypts content end to end.

### 3.3 TLS and what the edge can read

Cloudflare holds two separate connections: one with the visitor, one with the origin. The encryption mode only controls
the second. Flexible mode makes the origin leg plain HTTP; Full does not validate the origin certificate; Full (strict)
validates it (`https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/`, and the `flexible`, `full`,
`full-strict` pages). In every mode a proxied request is decrypted at Cloudflare's edge. **[PROPOSAL, technical]** The
mode for any Soccernity hostname should be Full (strict); counsel should know that Flexible would send credentials in
plain text between Cloudflare and Render.

---

## 4. Where processing happens, and what the free plan allows **[COPY PENDING LEGAL REVIEW]**

| Question | What the sources say | Source |
|---|---|---|
| Where does Cloudflare store personal data? | "We primarily store your information in the United States and the European Economic Area." Metadata "in our data centers in the United States and Europe". | Privacy policy §7; GDPR page |
| Where does traffic run? | Edge servers in "more than 330 cities around the world"; "data centers in over 330 cities across 100+ countries". | GDPR page |
| Does the DPA limit location? | Clause 6.1: Cloudflare "(and its sub-Processors) may process outside of the European Economic Area, Switzerland, and the United Kingdom, certain Personal Data". The DPA read for this draft states no location limit and lists no data-centre locations. | DPA v6.4, cl. 6.1; Annex 2 ("geographically-distributed data centers") |
| Can a customer limit where traffic is decrypted or logs are kept? | Regional Services ("restricts which Cloudflare data centers can decrypt and inspect your HTTPS traffic") and the Customer Metadata Boundary ("restricts where your logs and analytics data are stored"; EU or US; "Currently, this is available for Enterprise customers as part of the Data Localization Suite"). Operational metadata (e.g. internal debugging logs) is outside the boundary. | `https://developers.cloudflare.com/data-localization/`, `.../metadata-boundary/faq/` |
| Free plan: where is the data processed? | **Not addressed by any source retrieved.** The Enterprise-only note implies no boundary on Free. **[UNVERIFIED, FOR COUNSEL]** | — |
| Log retention for Customer Logs | **No figure found.** DPA: personal data is kept "Until the earliest of (i) expiry/termination of the Main Agreement, or (ii) the date upon which processing is no longer necessary" for either party's obligations; infrastructure access logs "for twelve months" (Annex 2). Cloudflare's docs say HTTP request logs are not retained by default for Logpull; Logpush is described as available on Free, Pro and Business in a recent changelog and as Enterprise-only in an older third-party article. | DPA Annex 1, Annex 2; `https://developers.cloudflare.com/logs/logpull/enabling-log-retention/`; Cloudflare changelog 2026-09-30 |
| Plan features on the free plan (what logs the dashboard shows) | Sources conflict (one third-party article says Free gets aggregated analytics and sampled security events only). **[UNVERIFIED, FOR COUNSEL]** | — |

**Consequence to record:** with the free plan Soccernity cannot promise users that traffic is decrypted or logged only
in a chosen region. The Enterprise localization tools exist, which is relevant to the options in Section 7 and to
counsel's view on whether a free plan is acceptable for children's data. No pricing was retrieved. **[OPEN]**

---

## 5. Contract terms **[COPY PENDING LEGAL REVIEW]**

| Point | What the DPA (v6.4, effective 3 April 2026) says | Note |
|---|---|---|
| How it binds | A preamble says the DPA forms part of "an Enterprise Subscription Agreement, Self-Serve Subscription Agreement or other written or electronic agreement", and "will be effective … from the date on which Customer signed or the parties otherwise agreed to this DPA". | Whether a Free-plan account is bound without an extra step is **not shown on the DPA page**. A Cloudflare community answer and the Cloudflare APPI trust page say the DPA is "incorporated by reference" into the Self-Serve Subscription Agreement and that it can be accepted in the dashboard. The Self-Serve Subscription Agreement (`https://www.cloudflare.com/terms/`) was **not read**. **[UNVERIFIED, FOR COUNSEL]** |
| Sub-processors | General written authorisation (cl. 4.3); Cloudflare adds new sub-processors to its list "at least thirty (30) days" before they start; an objection must be in writing "within ten (10) days of the notification"; otherwise the customer is "deemed to have consented" (cl. 4.4). The listed sub-processors (page last updated 1 October 2025) include Google, Oracle and AWS for named services; the page gives no location for core CDN/proxy services. | Someone at Soccernity must watch the list and act inside ten days. [PROPOSAL: name an owner in the incident/processor process.] |
| Breach notice | Cloudflare will "without undue delay notify the Customer upon becoming aware of any breach of security" (cl. 3.1(e)). No hour limit is stated. | Cloudflare's notice has no deadline, while Soccernity's own clocks (UK/EU 72 hours; Nigeria 72 hours under the GAID — see `docs/incident-response-and-breach-notification-plan-draft.md`, where present) start when Soccernity is "aware". |
| Government requests | Cloudflare must "immediately notify Customer of the request unless such notification is legally prohibited" (cl. 8.1(a)). | A child's data requested by a foreign authority would reach Soccernity only if not prohibited. |
| Deletion | At the customer's choice at the end, "other than to the extent required to comply with applicable law" (cl. 3.1(i)). | No days given. |
| Audit | Cl. 5 (read in the PDF; not summarised here). | Counsel to read. |

---

## 6. Transfers: the position, as questions for counsel with sources **[COPY PENDING LEGAL REVIEW]**

### 6.1 UK GDPR

- **The law changed on 5 February 2026.** On legislation.gov.uk, UK GDPR Articles 44 and 45 are shown as "omitted
  (5.2.2026)" and replaced by Article 44A ("General principles for transfers": a transfer is allowed only if approved by
  regulations under Article 45A, made subject to appropriate safeguards (Article 46), or made in reliance on a
  derogation (Article 49)). Article 46 now has paragraph 1A with a "data protection test", assessed by the controller
  or processor "acting reasonably and proportionately" and by the standard of protection "not materially lower"
  (`https://www.legislation.gov.uk/eur/2016/679/article/44A`, `.../article/46`; amended by the Data (Use and Access) Act
  2025 s. 142(1) and S.I. 2026/82). Article 45A was not fetched. **Any earlier wording that cites "adequacy" or an
  Article 45 test should be re-read against the current text.**
- **Cloudflare's stated mechanisms.** Privacy policy §7: "When Cloudflare transfers personal data from the EEA,
  Switzerland, or the United Kingdom (UK) to the United States, we rely on our certifications under the EU-U.S. Data
  Privacy Framework (EU-U.S. DPF), the Swiss-U.S. Data Privacy Framework (Swiss-U.S. DPF), and the UK Extension to the
  EU-U.S. DPF." "Should these certifications lapse or become otherwise invalidated, Cloudflare relies on the standard
  contractual clauses." The DPA incorporates the EU SCCs (Module Two/Three, cl. 6.2(a)) and "the International Data
  Transfer Addendum (Version B1.0) issued by the Information Commissioner's Office" (cl. 1.1(q), 6.2(b)), and cl. 6.4:
  "Cloudflare will notify Customer if its Data Privacy Framework certification lapses or is otherwise invalidated, in
  which instance any transfers … shall immediately be deemed a Restricted Transfer."
- **The UK extension.** The UK government's page "UK-US data bridge: supporting documents" (published 21 September 2023)
  says the regulations for the UK Extension "come into effect on 12 October 2023" and that "organisations (of any size)
  will no longer be required to put in place contractual safeguards" for transfers to certified US organisations
  (`https://www.gov.uk/government/publications/uk-us-data-bridge-supporting-documents`). **The ICO's own guide on
  international transfers could not be retrieved (it timed out twice), so the ICO's wording on "restricted transfer" and
  on transfer risk assessments is unverified, and the current status of the data bridge was not checked after 2023.
  [UNVERIFIED, FOR COUNSEL]**
- **Is a transfer happening at all?** Soccernity's legal entity is not yet registered (v0.7 note). Whether UK GDPR applies,
  to whom, and whether a UK user's request reaching a non-UK edge is a transfer by Soccernity or by Cloudflare as its
  processor, is for counsel (Q4).

### 6.2 Nigeria — NDPA 2023 and GAID 2025 (read from the official PDFs)

Retrieved from the NDPC-hosted GAID PDF (`https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf`)
and a PDF copy of the Act (`https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf`; an unofficial
copy of the Act, with OCR-type typos in the text — counsel should use the gazetted text).

- **s. 41(1):** a controller or processor "shall not transfer or permit personal data to be transferred from Nigeria to
  another country, unless — (a) the recipient of the personal data is subject to a law, binding corporate rules,
  contractual clauses, code of conduct, or certification mechanism that affords an adequate level of protection with
  respect to the personal data in accordance with this Act; or (b) one of the conditions set out in section 43 of this
  Act applies." **s. 41(2):** the controller or processor "shall record the basis for transfer … and the adequacy of
  protection". **s. 41(3):** the Commission "may make regulations requiring data controllers and data processors to
  notify it of the measures in place". **s. 41(4):** the Commission may designate categories of personal data "subject to
  additional specified restrictions on transfer … based on the nature of such personal data and risks to data subjects".
- **s. 42:** adequacy means principles "substantially similar" to the Act, assessed against six factors (enforceable
  rights and redress; an instrument between the Commission and the recipient jurisdiction's authority; public-authority
  access; an effective data protection law; an independent supervisory authority; international commitments). **s. 42(6):**
  "The absence of a determination by the Commission … shall not imply the adequacy of the protections afforded by it."
- **s. 43(1):** without adequacy, a transfer is allowed only if (a) the data subject has given and not withdrawn
  consent "after having been informed of the possible risks of such transfers for the data subject due to the absence of
  adequate protections"; (b) it is necessary for a contract with the data subject; (c) it is for the data subject's sole
  benefit and consent is impracticable; (d) public interest; (e) legal claims; (f) vital interests.
- **GAID 2025 Article 45(2):** "Pending the issuance of any regulatory instrument by the Commission on cross-border data
  transfer, the explanatory note in Schedule 5 of this GAID shall be used for the evaluation of countries for the
  purposes of determining their level of adequacy and for other grounds of cross-border data transfer". **Schedule 5**
  lists three grounds: "Adequacy Decision by the Commission; Cross-Border Data Transfer Instrument (CBDTI) approved by the
  Commission; and Other lawful bases." Para 6(c): "A compelling legal right is different from a business interest. Profit
  and personal business/organisational development considerations do not fall within this category." GAID Art. 48(2)
  treats approved "cross-border transfer instruments" as evidence of accountability.
- **What this draft could not find:** any NDPC adequacy decision for the US or the UK, any NDPC-approved CBDTI that
  Cloudflare's DPA or Data Privacy Framework certification is, or any list of approved instruments. **[UNVERIFIED, FOR
  COUNSEL]** The GAID's date of entry into force (reported as 19 September 2025 in a secondary source) was not verified.

### 6.3 US — COPPA and the other US questions

Soccernity already treats under-13 US users with a card-verification control (Part C; Decision Log #4 stays open). The
proxy receives IP addresses and request content from those children's browsers. Whether an edge proxy is a "service
provider" or "operator" for COPPA purposes, whether IP addresses as persistent identifiers collected by the proxy change
the notice or consent analysis, and whether a US-hosted edge is relevant to a state law, are questions for counsel (Q6).
This draft retrieved no US statute or guidance.

### 6.4 EU GDPR

Same structure as the UK (SCCs Module Two/Three and the EU–US Data Privacy Framework). The EU representative question
(DPIA R15) is already open. Cloudflare's DPF certification entity is Cloudflare, Inc. (privacy policy §7); whether the
certification's scope covers the processing of non-HR data for a self-serve customer was not checked. **[UNVERIFIED, FOR
COUNSEL]**

---

## 7. Options for counsel to weigh (without choosing) **[COPY PENDING LEGAL REVIEW]**

#449 is adopted. This section records what counsel's answers could change, and does **not** reopen it.

| | A. Proxy all three hostnames (API, web, admin) | B. Proxy only the two static sites | C. Do not adopt the proxy |
|---|---|---|---|
| Cloudflare sees | Credentials, tokens, cookies, DOBs, guardian and child data, uploads, staff reads | Static-site requests only: IPs, user agents, pages. Browser calls to the API go straight to the API hostname, not through Cloudflare | Nothing from the proxy; R2 role only |
| Purpose met | WAF and DDoS protection for the API and the sites; origin lock | DDoS protection and caching for the sites; no API protection from the edge | Platform-level protection from Render only |
| Policy and DPIA effect | PP §1.7/§1.8/§5 need the largest changes (Section 8.3); R11 widens | Smaller change: IP and page-view metadata; credentials not exposed | None beyond what exists |
| Origin lock needed | For API and sites | For the sites only | No |
| What counsel's answer would change | If transfers from Nigeria or for under-13 US users are not acceptable on the free plan, A is the option most affected | If counsel accepts static-site metadata but not credential exposure, B | If neither is acceptable at the free-plan terms |
| Variants counsel may name | Exclude the admin hostname; add Enterprise localization (Section 4); proxy only after a transfer instrument is recorded | — | — |

---

## 8. Proposed wording **[COPY PENDING LEGAL REVIEW]**

### 8.1 Privacy Policy §5 — processor list **[PROPOSAL, not yet built]**

Replace the existing "Cloudflare (R2 object storage)" bullet with:

> **Cloudflare** — two services. (1) **R2 storage:** stores the photos and videos you upload. (2) **Network protection
> [PROPOSAL, not yet built — Decision Log #449]:** the traffic between your device and our website, app and servers
> passes through Cloudflare's network, which helps protect them against attacks. Cloudflare handles that traffic on our
> instructions. It can see what is sent, including your IP address, and may handle it in countries outside the one you
> live in, including the United States. See Section [cross-border] for how we protect it. **[COPY PENDING LEGAL REVIEW]**
> **[OPEN: counsel — whether the policy should name the categories (sign-in details, content, IP address), and the
> wording for guardians.]**

### 8.2 Cross-border row (a new Part C row; numbering below)

> **Cross-border transfer — Cloudflare edge proxy and R2:** (a) all traffic to the proxied hostnames is decrypted and
> processed at Cloudflare's network, which operates in more than 330 cities in over 100 countries; the free plan has no
> regional controls; (b) Cloudflare's stated mechanisms are the Data Privacy Framework (EU, UK extension and Swiss
> certifications of Cloudflare, Inc.) with SCCs and the UK Addendum as fallback; (c) for transfers *from Nigeria* the
> basis under NDPA s. 41/43 and GAID Schedule 5 is **not established**; (d) US COPPA position **not established**;
> (e) log retention for customer logs **not stated by Cloudflare**; (f) sub-processor notice is 30 days with a 10-day
> objection window and needs an owner; (g) the DPA's binding effect on a Free-plan account is **unconfirmed**. Counsel
> status: **pending**. Not built. **[COPY PENDING LEGAL REVIEW]**

**Numbering.** The legal draft v0.11 has Part C rows up to 45. The view-data draft proposes row 45 (to be renumbered) and
the post-media draft proposes row 46. This is proposed as **row 47** and **must be renumbered when applied**. Counsel
may prefer to fold it into row 9 (the existing cross-border assessment) and row 20 (its restatement), which today list
"Postmark/S3/Sentry/Render/Neon/Upstash" and omit Cloudflare.

### 8.3 Existing statements the proxy would make inaccurate or incomplete **[COPY PENDING LEGAL REVIEW]**

**None edited.** For whoever applies a counsel-approved version.

| Where in v0.11 | What it says now | Why it needs a look |
|---|---|---|
| PP §1.7 (about line 646) | The one place an IP address is read "is the momentary country lookup when you register … it is not stored" | The proxy sees the IP address on every request; the statement is limited to Soccernity's own systems and should say so |
| PP §1.8 (about line 656) | "no third party receives the IP address. The IP address is read in memory for that lookup and is never stored or logged" | A third party (Cloudflare) would receive it; Soccernity's own non-storage is unchanged |
| PP §5, MaxMind bullet (about line 835) | "No IP address is sent to MaxMind or anyone else." | Same |
| PP §5, Cloudflare bullet | "used to store photos and videos you upload" | Does not cover the proxy |
| PP §9 retention table, "Country information" row | "The IP address used for the lookup is never stored." | Same limit as above |
| Part C rows 9, 20, 37, 38 | Row 9/20 omit Cloudflare; row 37 says R2 hash-matching coverage is unconfirmed; row 38 says IP is "never stored; no third party" | See above |
| Guardian consent screen / `CONSENT_SCREEN_VERSION` | Does not mention the proxy | A wording change there bumps the version (Decision Log #348); counsel decides whether guardians must be told |

### 8.4 DPIA R11 — proposed entry **[COPY PENDING LEGAL REVIEW]**

R11 in `docs/sprint-1-dpia-outline-draft.md` (v0.3) is "Sub-processor and hosting exposure (cannot be assessed yet)" and
still lists hosting and email as unselected. **[PROPOSAL]** Add the following to R11, or, if counsel prefers a separate
risk, record it as R32 (R17–R22 and R23–R31 are used by the view-data and post-media addenda):

> **R11 (addition) — Edge proxy that decrypts all traffic.** From the launch gate, a Cloudflare free-plan proxy sits in
> front of the API and the two static sites (Decision Log #449). It decrypts and can log every request, including
> credentials, session tokens, dates of birth, guardian-consent tokens, minors' posts and messages, uploads before
> moderation, and staff reads of children's data. Location of processing cannot be limited on the free plan; log
> retention is not stated; the DPA's effect on a Free-plan account is not confirmed; transfers from Nigeria have no
> established basis; the US under-13 position is unassessed. *Draft severity: high-impact if misused or breached, because
> the proxy is a single point where credentials and children's data are plaintext; likelihood unknown.* **Mitigations
> proposed:** Full (strict) TLS; a recorded Article 28/DPA acceptance and version; a named owner for Cloudflare's
> sub-processor list; Cloudflare account hardened (two-factor, least-privilege roles); no personal data cached at the
> edge (to be confirmed); minimal log retention, with "who may open Cloudflare logs" decided before launch; `TRUST_PROXY_HOPS`
> re-verified; counsel's answer on options A/B/C. **Residual:** open until Section 11 is answered. **[OPEN]**

---

## 9. Technical consequences for counsel to know **[COPY PENDING LEGAL REVIEW]**

### 9.1 `TRUST_PROXY_HOPS` must be re-verified (#429, B-267 (b))

In `services/api/src/trust-proxy.ts`, unset means no proxy is trusted: `req.ip` is the socket peer, the registration
country lookup is "unresolved", and the stronger safeguarding control (the card step for the under-13 US band) applies.
Today's design assumes a single Render hop. With Cloudflare in front, the number of hops in `X-Forwarded-For` changes,
and the right value must be measured (docs/deployment.md has the procedure for Render alone). Cloudflare also sets a
`CF-Connecting-IP` header, which a Render article recommends over the leftmost `X-Forwarded-For` entry; this code does
not use it. **Wrong in either direction is unsafe:** too low and every user shares Cloudflare's edge address, so every
per-IP limit (global limiter, sign-up 30 per 10 minutes, the 60-per-10-minute ceiling) collapses into one counter and
the country lookup fails for everyone (stronger control for all children, including non-US); too high and a visitor can
forge the header. The B-267 (b) check (fail one test account five times from network A, see the sixth blocked, then one
attempt from network B must succeed) must be repeated after the proxy is switched on. The hash of the IP in the auth
limiter keys is not an IP *log*, but counsel may want it considered with Section 8.3.

### 9.2 The origin lock

#449 says the Render origin accepts traffic only from the proxy; the mechanism is not designed. Documented options
(found by search, **not tested**): allow only Cloudflare's published IP ranges (`https://www.cloudflare.com/ips/`;
Cloudflare's docs say the ranges change rarely); and Authenticated Origin Pulls, a TLS client-certificate check from
Cloudflare to the origin (`https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/`).
Cloudflare's docs say the **global** certificate is shared across all Cloudflare accounts and only proves the request came
from Cloudflare's network, so a per-zone or per-hostname certificate is the stronger setup. **A finding for the founder:**
Render's "Inbound IP Rules" (`https://render.com/docs/inbound-ip-rules`; also an `ipAllowList` field in `render.yaml`)
are described as needing a **Scale or Enterprise workspace** for per-service rules. The repo's `render.yaml` uses a Free
(staging) and a Starter (production) plan, so the origin lock may not be possible on Render at the current plans, or may
cost more. **[UNVERIFIED, FOR COUNSEL; founder to confirm with Render]**

### 9.3 Other consequences

- **Access to Cloudflare logs is a new staff-access route to children's IP addresses.** Who may open the dashboard,
  and with what authentication, is a decision for the incident-response plan (B-253).
- **Caching.** No personal data or authenticated response should be cached at the edge; Soccernity has not set cache
  rules, and none were verified here. **[OPEN]**
- **Incident response.** Cloudflare as a processor notifies "without undue delay", not within hours (Section 5). The
  incident plan's timelines should say so.
- **Admin console.** Putting `admin.soccernity.com` behind the same proxy puts staff reads of children's data
  (including date-of-birth reads, B-109) through it. Option A variant "exclude admin" (Section 7) is a counsel question.
- **Stripe.** Not affected: card details bypass the API.
- **R2 and the public media address (B-265).** Whether the stored-media public address becomes a Cloudflare-proxied
  domain is a separate decision; if so, media viewing joins the same processing.

---

## 10. Corrected row references for B-251 **[COPY PENDING LEGAL REVIEW]**

The register row B-251, the Counsel column and Decision Log #424 cite "Part C rows 36, 14, 9, 20". Checked against
`docs/legal-copy-draft-tos-privacy-policy.md` v0.11 on 2026-11-01:

| Cited | What it is in v0.11 | Concerns processors? |
|---|---|---|
| 36 | The card-verification step | No |
| 14 | NDPA 2023 cross-check on the 6-month consent-record retention window | No |
| **9** | Cross-border data-location/transfer assessment for "Postmark/S3/Sentry/Render/Neon/Upstash" | **Yes — Cloudflare to be added** |
| **20** | Standalone restatement of row 9 | **Yes** |

**Corrected set (by content):** Part C **rows 9 and 20**, plus **PP §5** (processor list, including the Cloudflare R2 and
MaxMind bullets), plus **Part C row 38** (IP address processed transiently — the proxy contradicts "never stored; no
third party"), plus **row 37** (image-check processor; a pattern, and its R2 hash-matching question touches the same
vendor). In the DPIA: **R11** and **§1.5 "Technical context"** (still says hosting and data location are undecided,
Decision Log #9) and the R11 line of the §5 mitigations table. The register's Part C cross-reference table (about
line 460 of `docs/build-register.md`, "36 / 14 / 9 / 20") should read **9 / 20 / 38 (and 37 as a pattern)**.

---

## 11. Questions counsel must answer **[COPY PENDING LEGAL REVIEW]**

1. **Q1 — Roles.** Is Cloudflare a processor for all proxied traffic, and for what is it a controller (Section 2.1)? How is
   "Network Data" treated?
2. **Q2 — Soccernity's role and notice.** What must the policy say to users and, separately, to guardians about an
   edge proxy that decrypts their child's traffic? Does it bump `CONSENT_SCREEN_VERSION`?
3. **Q3 — Children.** Cloudflare says its own services are not for under-18s. Does that, or the absence of any child
   statement in the DPA, affect Soccernity's use for a children's platform?
4. **Q4 — UK/EU transfer.** Which Chapter V route applies (DPF/UK Extension, SCCs plus UK Addendum), under the UK law as
   amended on 5 February 2026? Is a transfer risk assessment needed, and is the free plan's lack of regional control
   acceptable? What is the current status of the UK–US data bridge?
5. **Q5 — Nigeria.** On what basis under NDPA s. 41/43 and GAID Schedule 5 may Nigerian users' traffic go through
   Cloudflare's network? Is there an NDPC-approved instrument; must the basis be recorded and notified (s. 41(2)–(3));
   is consent after informing of the risks (s. 43(1)(a)) workable for children, and who consents?
6. **Q6 — US.** COPPA and any state law for an edge proxy handling under-13 IP addresses and content.
7. **Q7 — Contract.** Does the DPA bind a Free-plan account, and how is acceptance recorded? Who owns the 10-day
   sub-processor objection window?
8. **Q8 — Logs.** What is the retention of customer logs on the free plan, who at Soccernity may view them, and should
   a shorter or Enterprise setting be required?
9. **Q9 — Options.** A, B or C (Section 7); is excluding the admin hostname required?
10. **Q10 — Existing text.** The PP IP statements (Section 8.3), the row 9/20 omission, and the Render-already-uses-Cloudflare
    check.
11. **Q11 — Incident plan.** Cloudflare's notice has no hour limit; how does that fit the 72-hour clocks?

---

## 12. Sourcing and limits of this draft **[COPY PENDING LEGAL REVIEW]**

- **How it was gathered.** Search results (Cloudflare, Render, UK government, ICO, NDPC) plus page reads. Page reads
  went through a tool that **summarises with a smaller model**; quotations are the tool's returned text unless stated.
  The Cloudflare DPA PDF (v6.4), the NDPA PDF and the GAID 2025 PDF were saved locally and read by text extraction,
  so quotations from those three documents are from the documents.
- **Not retrieved / unverified:** the ICO international-transfers guide (timed out twice); the data-bridge status after
  2023; UK Article 45A; the Cloudflare Self-Serve Subscription Agreement; free-plan data location and log retention;
  Cloudflare's sub-processor locations for core services; Render's sub-processor list and the Render–Cloudflare
  statement; Render's origin-lock options on the current plans; any NDPC adequacy decision or approved instrument; US
  law; the date the GAID entered force.
- **Dates:** Cloudflare DPA v6.4 effective 3 April 2026; Cloudflare privacy policy effective 4 November 2025;
  sub-processor page last updated 1 October 2025; the UK GDPR amendments effective 5 February 2026; GOV.UK page published
  21 September 2023. All may have changed.
- **Not decided here:** anything in Sections 7 and 11. Nothing in this file edits the legal draft, the DPIA, the register,
  the Build Plan or any code.

---

## 13. Sign-off **[COPY PENDING LEGAL REVIEW]**

| Role | Name | Date | Decision |
|---|---|---|---|
| Counsel | | | |
| Founder | | | |

**This block is empty on purpose.** Until it is signed this file is a draft.
