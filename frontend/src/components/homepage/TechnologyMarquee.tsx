import Image from 'next/image';
import { Code2 } from 'lucide-react';

const TECHNOLOGIES = [
  { label: 'React', slug: 'react', color: '61DAFB' },
  { label: 'Next.js', slug: 'nextdotjs', color: 'ffffff' },
  { label: 'TypeScript', slug: 'typescript', color: '3178C6' },
  { label: 'JavaScript', slug: 'javascript', color: 'F7DF1E' },
  { label: 'Node.js', slug: 'nodedotjs', color: '5FA04E' },
  { label: 'React Native', slug: 'react', color: '61DAFB' },
  { label: 'Python', slug: 'python', color: '3776AB' },
  { label: 'Tailwind CSS', slug: 'tailwindcss', color: '06B6D4' },
  { label: 'PostgreSQL', slug: 'postgresql', color: '4169E1' },
  { label: 'Supabase', slug: 'supabase', color: '3FCF8E' },
  { label: 'Vercel', slug: 'vercel', color: 'ffffff' },
  { label: 'GitHub', slug: 'github', color: 'ffffff' },
  { label: 'Docker', slug: 'docker', color: '2496ED' },
  { label: 'Rust', slug: 'rust', color: 'DEA584' },
  { label: 'Go', slug: 'go', color: '00ADD8' },
  { label: 'Solidity', slug: 'solidity', color: '8C8C8C' },
  { label: 'HTML5', slug: 'html5', color: 'E34F26' },
  { label: 'CSS', slug: 'css', color: '663399' },
] as const;

export function TechnologyMarquee({ compact = false }: { compact?: boolean }) {
  const loop = [...TECHNOLOGIES, ...TECHNOLOGIES];

  return (
    <div className={`xv-tech-marquee${compact ? ' is-compact' : ''}`} aria-label="Technologies supported by Xroga AI">
      <div className="xv-tech-marquee-title">
        <Code2 aria-hidden="true" />
        <span><b>BUILT WITH</b><small>MODERN TECHNOLOGY</small></span>
      </div>
      <div className="xv-tech-marquee-window">
        <div className="xv-tech-marquee-track">
          {loop.map((technology, index) => (
            <span key={`${technology.label}-${index}`} aria-hidden={index >= TECHNOLOGIES.length}>
              <Image
                src={`https://cdn.simpleicons.org/${technology.slug}/${technology.color}`}
                width={25}
                height={25}
                alt={index < TECHNOLOGIES.length ? `${technology.label} logo` : ''}
                unoptimized
              />
              <b>{technology.label}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
