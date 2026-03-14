/**
 * Shared page header — consistent title + subtitle across all screens.
 *
 * On mobile:  px-4, compact text, optional sticky.
 * On md–xl:   hamburger clearance (pl-14), larger text.
 * On xl+:     no hamburger so pl resets, sidebar provides navigation.
 *
 * Props:
 *   title    — page title string
 *   subtitle — short description string
 *   actions  — optional right-side slot (e.g. search input)
 *   sticky   — make header sticky (useful for scrollable pages like Plan)
 */
export default function PageHeader({ title, subtitle, actions, sticky = false }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4',
        'px-4 md:px-0 md:pl-14 xl:pl-0',
        'py-4 md:py-5',
        'border-b border-slate-700/10',
        'mb-4 md:mb-5',
        sticky
          ? 'sticky top-0 z-20 bg-[#22364f]/95 backdrop-blur-md'
          : '',
      ].join(' ')}
    >
      <div className="min-w-0">
        <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs md:text-sm text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
