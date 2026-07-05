import type { ReactNode } from "react";

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="underline underline-offset-4 hover:text-zinc-950 dark:hover:text-zinc-50"
    >
      {children}
    </a>
  );
}

export function LegalArticle({
  title,
  sections,
}: {
  title: string;
  sections: LegalSection[];
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <div className="mt-8 flex flex-col gap-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
