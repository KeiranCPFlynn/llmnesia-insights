import type { ReactNode } from 'react';
import { formatWeek } from '../lib/format';
import { calendarWeekStart } from '../lib/week';
import { PageNav } from './PageNav';

export type SectionLink = {
  href: string;
  label: string;
};

export function AppShell({
  week,
  eyebrow,
  title,
  description,
  context,
  controls,
  sections,
  children,
}: {
  week: string;
  eyebrow: string;
  title: string;
  description: string;
  context: string;
  controls?: ReactNode;
  sections?: SectionLink[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-white/[0.07] bg-[#090d10]/92 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="px-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-sm font-black text-[#07110d] shadow-[0_0_24px_rgba(52,211,153,0.18)]">
              L
            </span>
            <div>
              <div className="text-sm font-semibold tracking-tight text-neutral-100">LLMnesia</div>
              <div className="text-[11px] text-neutral-500">Operating workspace</div>
            </div>
          </div>
        </div>

        <div className="mt-7">
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">
            Workspaces
          </div>
          <PageNav week={week} variant="rail" />
        </div>

        <div className="mt-auto rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600">
            Active period
          </div>
          <div className="mt-1.5 text-sm font-medium text-neutral-200">
            Week of {formatWeek(calendarWeekStart(week))}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            The same reporting period follows you across all three workspaces.
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#090d10]/94 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-400 text-xs font-black text-[#07110d]">
              L
            </span>
            <span className="text-sm font-semibold text-neutral-100">LLMnesia workspace</span>
          </div>
          <PageNav week={week} variant="tabs" />
        </div>

        <main className="mx-auto w-full max-w-[86rem] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <header className="mb-6 rounded-2xl border border-white/[0.07] bg-[#101519]/82 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                  {eyebrow}
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-50 sm:text-[1.75rem]">
                  {title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
                  {description}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1 text-xs text-neutral-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {context}
                </div>
              </div>
              {controls && <div className="min-w-0 xl:max-w-3xl">{controls}</div>}
            </div>
          </header>

          {sections && sections.length > 0 && (
            <nav
              aria-label="On this page"
              className="sticky top-[7.1rem] z-30 mb-6 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-[#0c1114]/94 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl lg:top-3"
            >
              {sections.map((section) => (
                <a
                  key={section.href}
                  href={section.href}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100"
                >
                  {section.label}
                </a>
              ))}
            </nav>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
