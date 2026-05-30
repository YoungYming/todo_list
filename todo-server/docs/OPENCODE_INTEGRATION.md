# OpenCode 接入说明

OpenCode 独立配置与部署；本项目中仅作为「拆分」等能力的一个**可接入服务**，通过 Todo Server 的 Provider 接口调用，不深度耦合，不影响 OpenCode 在其他项目中的应用。

---

## 解耦与部署原则

- **OpenCode 是独立系统**：可在其他项目中单独提供大模型/代码等能力；本项目仅通过**标准 HTTP 或约定 API** 调用其服务（例如拆分时由 LLMProvider 请求 OpenCode），不内嵌 OpenCode 专属代码，不绑架其演进。
- **接入方式**：在 Todo Server 侧实现一个「拆分 Provider」（如 LLMProvider），该 Provider 内部请求 OpenCode 的接口；配置（OpenCode 服务地址、鉴权等）仅存在于 Todo Server 的配置或环境变量中，便于随时切换或关闭。
- **部署要求**：OpenCode 应**配置在云服务器上**（与 Todo Server 同云或可被 Todo Server 访问的云环境），不要在本机配置或长期运行，以避免本机隐私与安全问题。API 密钥、服务地址等仅在云上配置。

---

## 与本项目的关系

- **当前**：拆分默认使用本地规则（`local_rules`）；如需大模型拆分，可新增 LLMProvider，在 Provider 内调用 OpenCode 的 chat/推理接口，输入为 Epic 的 title/description，输出为候选子任务列表（与现有 SplitProvider 约定一致）。
- **配置**：在部署 Todo Server 的云环境中配置 OpenCode 服务 URL 及鉴权信息；Todo Server 仅作为调用方，不托管 OpenCode 的代码或运行时。

详见设计文档中的「拆分学习机制」与「Provider 接口与后续大模型接入」（DESIGN.md 第四节）。
