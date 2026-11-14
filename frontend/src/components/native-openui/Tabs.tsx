'use client';

// Adapted from CopilotKit's standard generative UI Tabs (MIT), pinned at
// c7815d9ac96f48fb3a64ad8c18e176a870c81763. See COPILOTKIT-LICENSE.
import { defineComponent } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { children } from './upstream/components/style';

export const Tabs = defineComponent({
  name: 'Tabs',
  description: 'Keyboard-accessible optional views or scenarios. Put all essential conclusions in visible content outside the tabs.',
  props: z.object({ label: z.string().min(1).max(80), tabs: z.array(z.object({ title: z.string().min(1).max(64), content: children })).min(2).max(6) }),
  component: function NativeTabs({ props, renderNode }) {
    const tabs = props.tabs ?? [];
    if (!tabs.length) return null;
    return <section className="xroga-native-sections" aria-label={props.label}>
      <h2>{props.label}</h2>
      {tabs.map((tab, index) => <section key={index}>
        <h3>{tab.title}</h3>
        <div className="iui-col iui-flow">{renderNode(tab.content)}</div>
      </section>)}
    </section>;
  },
});
