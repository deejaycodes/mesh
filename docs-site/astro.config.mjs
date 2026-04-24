import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Corelay Mesh",
      social: { github: "https://github.com/corelay-dev/mesh" },
      sidebar: [
        { label: "Getting Started", items: [
          { label: "Introduction", link: "/" },
          { label: "Quick Start", link: "/quick-start" },
        ]},
        { label: "Primitives", items: [
          { label: "Agent", link: "/primitives/agent" },
          { label: "Peer & Inbox", link: "/primitives/peer-inbox" },
          { label: "Capability", link: "/primitives/capability" },
          { label: "Workflow", link: "/primitives/workflow" },
          { label: "Channel", link: "/primitives/channel" },
        ]},
        { label: "Coordination", items: [
          { label: "Pipeline", link: "/coordination/pipeline" },
          { label: "Critic", link: "/coordination/critic" },
          { label: "Debate", link: "/coordination/debate" },
          { label: "Hierarchy", link: "/coordination/hierarchy" },
          { label: "Human-in-the-Loop", link: "/coordination/human" },
        ]},
        { label: "Compose", items: [
          { label: "Authoring by Review", link: "/compose/overview" },
          { label: "Workflow Authoring", link: "/compose/workflows" },
          { label: "Self-Healing", link: "/compose/self-healing" },
          { label: "Eval Authoring", link: "/compose/eval-authoring" },
        ]},
        { label: "Packages", link: "/packages" },
      ],
    }),
  ],
});
