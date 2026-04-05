# Changelog

## [1.1.0](https://github.com/aiyu-ayaan/LoadPulse/compare/v1.0.1...v1.1.0) (2026-04-05)


### Features

* add NewTestPage for configuring and initiating load tests ([b2f0256](https://github.com/aiyu-ayaan/LoadPulse/commit/b2f0256009045631e6a3840337aaf8591367f5fb))
* add p95 and p99 latency metrics to live metrics and update related interfaces ([2a48b2f](https://github.com/aiyu-ayaan/LoadPulse/commit/2a48b2fd21bb64cf4550eb52c4dbbc099a338c80))
* add PM2 support for clustering and integration scheduler ([f482564](https://github.com/aiyu-ayaan/LoadPulse/commit/f482564d91feacb6cceced51a4a6846f2f964b0f))
* **admin-ui:** add AI management workspace and make it admin home ([f6c88a6](https://github.com/aiyu-ayaan/LoadPulse/commit/f6c88a6e9fa4d3e44aa0951693aff652669f851a))
* **ai-backend:** persist runtime settings and usage history with explicit summary generation ([506c234](https://github.com/aiyu-ayaan/LoadPulse/commit/506c2340bfdf2d59f47f072e67d57ba960cdf91c))
* **ai-ui:** add admin AI history, auto-generate toggle, and manual summary generation flow ([3e8f1b8](https://github.com/aiyu-ayaan/LoadPulse/commit/3e8f1b8b7ff99dc9fe0409859985fe8a0ff836fc))
* **ai:** add checks for AI configuration before consuming credits ([c0c8153](https://github.com/aiyu-ayaan/LoadPulse/commit/c0c815328fdd4b96fdbcc683cb19f1f2a9592c14))
* **ai:** implement AI credit system with user limits and reset intervals ([27845e5](https://github.com/aiyu-ayaan/LoadPulse/commit/27845e53c306237a48e911ed9f3c5dba92ac278a))
* **api:** add admin AI client types and endpoints ([a8c5f2e](https://github.com/aiyu-ayaan/LoadPulse/commit/a8c5f2e466b026564645d222f5f8627b1ca311bd))
* **api:** add AI test summary and AI test-plan endpoints to client layer ([37307d7](https://github.com/aiyu-ayaan/LoadPulse/commit/37307d78b3047896317494f8b6188c4084245fb5))
* **auth:** integrate user refresh functionality in multiple pages ([b09f1f5](https://github.com/aiyu-ayaan/LoadPulse/commit/b09f1f52a5e763b2e74b5badb0ee497f1cded94c))
* enhance NewTestPage input handling and script generation for load tests ([498adbe](https://github.com/aiyu-ayaan/LoadPulse/commit/498adbea000b2c25a8a785085a41fef05803b0ef))
* enhance NewTestPage with improved UI components and script handling ([f78b841](https://github.com/aiyu-ayaan/LoadPulse/commit/f78b84134e0d94160fcab762a731835f04e19a15))
* **env:** add MongoDB TLS and data encryption settings to environment configuration ([c79de8f](https://github.com/aiyu-ayaan/LoadPulse/commit/c79de8f6a08ccbacca74bdac9b1293f783ab751d))
* implement NewTestPage for configuring and running k6 load tests ([7a27c8e](https://github.com/aiyu-ayaan/LoadPulse/commit/7a27c8ed05c5942873b0df38901c14d171bd16d0))
* **release:** add configuration file for release-please action ([309ed8b](https://github.com/aiyu-ayaan/LoadPulse/commit/309ed8becf774eab7e78f0926ce3317183f7ad45))
* **reports:** enhance PDF export with AI summary and improved styling ([305f6ca](https://github.com/aiyu-ayaan/LoadPulse/commit/305f6caff8e5b15d55e2c16abcd2db6518417ac7))
* **server-ai:** add fallback AI runtime for test summaries and AI test config generation ([6b2ca98](https://github.com/aiyu-ayaan/LoadPulse/commit/6b2ca98e56aa42a4a981f4c49fc475649e1094a1))
* **server:** add secure admin AI integrations and model-priority APIs ([d51ebe0](https://github.com/aiyu-ayaan/LoadPulse/commit/d51ebe0688fa411184a63ba4a97679d05a3fbf60))
* **test-ui:** integrate AI into new-test, details, reports, and history flows ([c6c7abc](https://github.com/aiyu-ayaan/LoadPulse/commit/c6c7abca289f9545dfaee43ba8237601a2a7dc5c))
* **tests:** add username tracking to test runs and update related components ([38494e6](https://github.com/aiyu-ayaan/LoadPulse/commit/38494e6c38fc7bf61c7fb84fea0c374b05a4f6a9))
* **ui:** implement RichTextView component for rendering AI summaries in Markdown format ([06d5614](https://github.com/aiyu-ayaan/LoadPulse/commit/06d5614ccad439511928b9480c3ad23602633273))


### Bug Fixes

* **admin:** remove duplicate entry for Accounts in adminLinks ([5404964](https://github.com/aiyu-ayaan/LoadPulse/commit/54049649fea58a4d20527b6c856a17134d8fc721))
* **ai-summary:** persist generated summary in polling and render markdown/html safely ([f4307bc](https://github.com/aiyu-ayaan/LoadPulse/commit/f4307bc041fa1512d5405d7bdb15691d2ec3a724))
* **ui:** clean up JSX formatting for error and success messages in Admin pages ([92fd3a0](https://github.com/aiyu-ayaan/LoadPulse/commit/92fd3a06d4326b78fdd15d58d58bcd81596d0b05))
* **ui:** update button className formatting for better readability ([bad180b](https://github.com/aiyu-ayaan/LoadPulse/commit/bad180be6f703739bc9a06ea6d7671f349d902ac))

## [1.0.1](https://github.com/aiyu-ayaan/LoadPulse/compare/v1.0.0...v1.0.1) (2026-04-03)


### Bug Fixes

* remove admin checks from project access functions ([953b027](https://github.com/aiyu-ayaan/LoadPulse/commit/953b0275c3bb8361becbade6bfa235a6fec12e50))

## 1.0.0 (2026-04-03)


### Features

* **access:** improve access list management and response structure in project access API ([b8a28b4](https://github.com/aiyu-ayaan/LoadPulse/commit/b8a28b436c634f4340291bd5aee57d2790044aa8))
* add backend API for load testing with k6 integration ([7456220](https://github.com/aiyu-ayaan/LoadPulse/commit/7456220f6893738a8fd78bd5823d1069ffaa9780))
* add MONGO_PORT environment variable for flexible MongoDB port mapping in Docker ([995b2e0](https://github.com/aiyu-ayaan/LoadPulse/commit/995b2e0362a61796b2c07f47f66e357f6b567fa1))
* add new pages for integrations, new test, reports, settings, and test history ([e90e6a2](https://github.com/aiyu-ayaan/LoadPulse/commit/e90e6a278027663e49505b42293d96d48f3cbbe4))
* add project deletion functionality with confirmation dialog and update UI accordingly ([59061d8](https://github.com/aiyu-ayaan/LoadPulse/commit/59061d837f87ba4beddda175d589736e29d1b24a))
* add running tests summary and test details page with dashboard integration ([8495d46](https://github.com/aiyu-ayaan/LoadPulse/commit/8495d46a5790cdd78441d403d45dc939e4dd86fc))
* enhance README with project capabilities and add LinkedIn post draft; implement ScriptEditor component with syntax highlighting ([2307f80](https://github.com/aiyu-ayaan/LoadPulse/commit/2307f80416c6a3a1ba0fd34054cd66f3d44797e7))
* enhance sign-in page with GitHub authentication and signup flow ([9fd0246](https://github.com/aiyu-ayaan/LoadPulse/commit/9fd024683d604573db41514b5dc4af014e0efb4e))
* implement notification system with context and hooks for real-time updates ([75e87e9](https://github.com/aiyu-ayaan/LoadPulse/commit/75e87e93ce3e5abdcb4cc284ca166899a21e3772))
* implement project management features with context and UI updates ([8ece8d6](https://github.com/aiyu-ayaan/LoadPulse/commit/8ece8d69ae1505ae77c26f7f4778f9e7a91a5793))
* implement two-factor authentication in SignInPage and add related utilities ([ff29757](https://github.com/aiyu-ayaan/LoadPulse/commit/ff29757631a1a64be8f5983dad378abb912d8a55))
* implement user authentication and authorization system ([1044ab0](https://github.com/aiyu-ayaan/LoadPulse/commit/1044ab0345e98ef0ebf26e05e6c0d06d60e2b3a1))
* **integrations:** add project tokens, cron scheduler, and trigger APIs ([53aa20d](https://github.com/aiyu-ayaan/LoadPulse/commit/53aa20dca705dcd93c1b52b037caedf24557ebd9))
* **integrations:** enhance project-wise integrations with new job types and detailed API documentation ([24ac9c8](https://github.com/aiyu-ayaan/LoadPulse/commit/24ac9c8eb85f2d6b30ad2acbe7cf41c18d74605c))
* **layout:** remove top header and add collapsible project-aware sidebar ([5b59129](https://github.com/aiyu-ayaan/LoadPulse/commit/5b5912948bd4d455af7809db9bb75e602e1d7dba))
* **reports:** make project report actions and run selection functional ([ecde44e](https://github.com/aiyu-ayaan/LoadPulse/commit/ecde44e2c3296daf00e95f804b3160030b0526fb))
* **routing:** move app to project-scoped URLs with route persistence ([86b8d31](https://github.com/aiyu-ayaan/LoadPulse/commit/86b8d31c25d91e70a345ce2a4a6d2f3ae45029fe))
* **settings:** enhance project access management with safe member handling and improved UI feedback ([082faf5](https://github.com/aiyu-ayaan/LoadPulse/commit/082faf53f1215c98109d59be573f907c11e39537))
* **settings:** support user-only settings without project context ([fb41a23](https://github.com/aiyu-ayaan/LoadPulse/commit/fb41a23ce7f6e0ec4fb3e0675e16166fc7f986c5))
* **tests:** implement stop functionality for test runs and update related UI components ([1a6e539](https://github.com/aiyu-ayaan/LoadPulse/commit/1a6e539db2ef6ab799e0280f6b463481038391a2))
* **ui:** add HelperNote component and enhance dashboard, new test, and reports pages with contextual guidance ([bf5925c](https://github.com/aiyu-ayaan/LoadPulse/commit/bf5925cc87cc90c111af781705368f774687c9ff))
* **ui:** add project-wise integrations page with cron and token management ([8531d51](https://github.com/aiyu-ayaan/LoadPulse/commit/8531d5184dd9e77fa62b1772b704a8e0aef02137))
* **ui:** enhance DashboardLayout with improved navigation button styles and notification handling ([0332e1a](https://github.com/aiyu-ayaan/LoadPulse/commit/0332e1a1ce4a32263aa29acf0ba44341b5f5a87b))
* **ui:** enhance ProjectMemberRow with unsaved changes indicator and improved access management UI ([2b5becc](https://github.com/aiyu-ayaan/LoadPulse/commit/2b5becc100a5305ffda2894c8cc79a4acf1042c4))


### Bug Fixes

* correct indentation in conditional rendering of messages in SignInPage ([0eba634](https://github.com/aiyu-ayaan/LoadPulse/commit/0eba6347323da76012bc860a903881b0a87ded40))
* **integrations:** contain script editor inside create job dialog ([eb17b5a](https://github.com/aiyu-ayaan/LoadPulse/commit/eb17b5a74f354e99ec27fb05fada317431261663))
* **integrations:** separate cron and api trigger modes ([f549284](https://github.com/aiyu-ayaan/LoadPulse/commit/f54928417079b4f4e907de95a2e46ecacdd223c3))
* redirect integrations route to settings page and clean up imports in DashboardLayout ([620d674](https://github.com/aiyu-ayaan/LoadPulse/commit/620d674f57fae317490e8cb60d66c6f3495955b8))
* **ui:** clean up conditional class names for better readability in SettingsPage ([a2746f5](https://github.com/aiyu-ayaan/LoadPulse/commit/a2746f52daec1bd1404fd54c75773a6896a5793e))
* update caret color for body and form elements in index.css ([bfe1bf6](https://github.com/aiyu-ayaan/LoadPulse/commit/bfe1bf659cfd270dc89f87f3ada26cbc6dd35478))


### Performance Improvements

* add redis caching and optimize mongo indexes ([e37f911](https://github.com/aiyu-ayaan/LoadPulse/commit/e37f911860ccf28e371e5325b42bc1084e94fed2))
