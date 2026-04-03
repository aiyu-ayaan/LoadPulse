# Changelog

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
