import { REPO_CODE, REPO_TREE } from '@/lib/gameCockpitContent';
import { HudIcon } from './HudIcons';

/**
 * Your game, your repository.
 *
 * A server component. The tree and the sample are static, and the sample is real
 * engine-shaped code rather than pseudo-code — imports, a constructor, a collider,
 * a return — so a developer reading it recognises the shape of the project they
 * would get. It contains no key, token, URL, org name, or repository identifier;
 * everything is a local module path.
 */
export function RepositoryPreview() {
  return (
    <section className="xv-gc-panel xv-gc-repo" aria-labelledby="gc-repo-title">
      <header className="xv-gc-panel__head">
        <h2 className="xv-gc-panel__title" id="gc-repo-title">
          <span className="xv-gc-panel__index">6.</span> Your game, your repo
        </h2>
      </header>

      <p className="xv-gc-repo__lede">
        Clean, well-structured code. Fully yours. Push, edit, extend and ship anywhere.
      </p>

      <div className="xv-gc-repo__split">
        <ul className="xv-gc-tree" aria-label="Example project structure">
          {REPO_TREE.map((entry) => (
            <li key={entry.name} className="xv-gc-tree__row">
              <HudIcon name={entry.kind === 'dir' ? 'folder' : 'file'} size={13} />
              <span>{entry.name}</span>
            </li>
          ))}
        </ul>

        <pre className="xv-gc-code" aria-label="Example generated source">
          <code>
            {REPO_CODE.map((line, index) => (
              <span className="xv-gc-code__line" key={index}>
                <span className="xv-gc-code__ln" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{line || ' '}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </section>
  );
}
