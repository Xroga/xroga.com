'use client';

// Adapted from CopilotKit's standard generative UI Tabs (MIT), pinned at
// c7815d9ac96f48fb3a64ad8c18e176a870c81763. See COPILOTKIT-LICENSE.
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { defineComponent } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { children } from './upstream/components/style';

export const Tabs = defineComponent({
  name: 'Tabs',
  description: 'Keyboard-accessible optional views or scenarios. Put all essential conclusions in visible content outside the tabs.',
  props: z.object({ label: z.string().min(1).max(80), tabs: z.array(z.object({ title: z.string().min(1).max(64), content: children })).min(2).max(6) }),
  component: function NativeTabs({ props, renderNode }) {
    const id = useId();
    const [ownIndex, setOwnIndex] = useState(0);
    const tabs = props.tabs ?? [];
    const count = tabs.length;
    const selected = Math.min(ownIndex, Math.max(0, count - 1));
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const select = (index: number, focus = false) => {
      setOwnIndex(index);
      if (focus) tabRefs.current[index]?.focus();
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
      const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : undefined;
      const next = step !== undefined && count ? (selected + step + count) % count
        : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : undefined;
      if (next === undefined || count === 0) return;
      event.preventDefault();
      select(next, true);
    };
    if (!count) return null;
    return <div className="xroga-native-tabs">
      <div role="tablist" aria-label={props.label} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => <button key={index} ref={element => { tabRefs.current[index] = element; }}
          type="button" role="tab" id={id + '-tab-' + index} aria-selected={selected === index}
          aria-controls={id + '-panel-' + index} tabIndex={selected === index ? 0 : -1} onClick={() => select(index)}>
          {tab.title}
        </button>)}
      </div>
      {tabs.map((tab, index) => <div key={index} hidden={index !== selected}
        role="tabpanel" id={id + '-panel-' + index} aria-labelledby={id + '-tab-' + index} tabIndex={0}>
        {index === selected && renderNode(tab.content)}
      </div>)}
    </div>;
  },
});
