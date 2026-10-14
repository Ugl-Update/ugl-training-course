// Single source of truth for what is in the course. Used by the portal (index.html)
// and by module.html. Every item lives in exactly one section of the portal:
//   section 'course'    -> a track on the Course tab (counts toward progress)
//   section 'tools'     -> a group on the Tools tab (quick reference, not graded)
//   section 'simulator' -> the Simulator tab
// `path` is the file's location in the private Supabase bucket: .html paths open inside the
// site (module.html); other files open via a signed URL. `soon: true` shows a placeholder.
// To add content: upload the file to Storage > course, then add an entry here.
window.UGL_CATALOG = {
  tracks: [
    { id: 'start',      title: 'Start Here',          desc: 'Industry basics, who does what, and the reference guide every dispatcher keeps open.' },
    { id: 'workflow',   title: 'Daily Workflow',      desc: 'The routines you repeat every shift: updates, rate confirmations, emails and pickups.' },
    { id: 'equipment',  title: 'Equipment Policies',  desc: 'Dispatching policy for each trailer type: what must be confirmed before you give “Good to Go”.' },
    { id: 'compliance', title: 'Compliance & Safety', desc: 'FMCSA rules, roadside inspections and crash reviews.' }
  ],
  toolGroups: [
    { id: 'inbox',   title: 'Email & inbox',    desc: 'Find the right move for any carrier or broker email.' },
    { id: 'weights', title: 'Weights & limits', desc: 'Check a scale ticket, axle limits, state rules and chain laws.' },
    { id: 'safety',  title: 'Safety',           desc: 'Decide what happens after an accident.' }
  ],
  // hidden: true keeps the Simulator out of the site until the real cases are ready.
  simulator: { id: 'simulator', cases: 4, hidden: true },
  items: [
    // ---- Course
    { id: 'fundamentals',       section: 'course', track: 'start',      kind: 'deck',   tag: 'DECK',      title: 'Fundamentals',                  path: 'UGL-Fundamentals-Final.html',             desc: 'Start here: industry basics, equipment, Samsara & TMS, Gmail and core paperwork.' },
    { id: 'responsibilities',   section: 'course', track: 'start',      kind: 'policy', tag: 'CHECKLIST', title: 'Load Updater Responsibility Checklist', path: 'pages/responsibilities.html', desc: 'Every step a load updater owns, from the rate confirmation to the completed POD.' },
    { id: 'industry-reference', section: 'course', track: 'start',      kind: 'deck',   tag: 'DECK',      title: 'Industry Reference Guide',      path: 'UGL-Industry-Reference-Guide-Final.html', desc: 'Freight, equipment, compliance and workflow in one reference deck.' },

    { id: 'updater-guide',      section: 'course', track: 'workflow',   kind: 'deck',   tag: 'DECK',      title: 'Updater Guide',                 path: 'UGL-UpdaterGuide-Final.html',             desc: 'Load update procedures and the daily updater workflow.' },
    { id: 'read-the-rc',        section: 'course', track: 'workflow',   kind: 'deck',   tag: 'DECK',      title: 'How To Read The RC',            path: 'UGL-HowToReadTheRC-Final.html',           desc: 'The rate confirmation, walked through line by line.' },
    { id: 'sample-rc',          section: 'course', track: 'workflow',   kind: 'file',   tag: 'PDF',       title: 'Sample Rate Confirmation',      path: 'files/sample-rate-confirmation.pdf',      desc: 'A real rate confirmation to practise reading.' },
    { id: 'send-an-email',      section: 'course', track: 'workflow',   kind: 'deck',   tag: 'DECK',      title: 'How To Send An Email',          path: 'UGL-HowToSendAnEmail-Final.html',         desc: 'Email workflow for dispatch communications.' },
    { id: 'email-course',       section: 'course', track: 'workflow',   kind: 'summary', icon: 'mail', tag: 'COURSE',   title: 'Carrier Dispatch Email Course', path: 'pages/email-course.html',              desc: '10 modules on reading, checking and answering carrier and broker emails, and spotting scams. Real examples and a knowledge check.' },
    { id: 'pickup-checklist',   section: 'course', track: 'workflow',   kind: 'deck',   tag: 'DECK',      title: 'Pick Up Checklist',             path: 'UGL-PickUpChecklist-Final.html',          desc: 'Step-by-step pickup procedures.' },

    { id: 'policy-dry-van',     section: 'course', track: 'equipment',  kind: 'policy', tag: 'POLICY',    title: 'Dry Van Dispatching Policy',    path: 'pages/policy-dry-van.html',               desc: 'Before pickup, in transit and at delivery for dry van loads.' },
    { id: 'policy-reefer',      section: 'course', track: 'equipment',  kind: 'policy', tag: 'POLICY',    title: 'Reefer Dispatching Policy',     path: 'pages/policy-reefer.html',                desc: 'Temperature control, cargo handling, pre-trip and paperwork for reefer loads.' },
    { id: 'policy-flatbed',     section: 'course', track: 'equipment',  kind: 'policy', tag: 'POLICY',    title: 'Flatbed Dispatching Policy',    path: 'pages/policy-flatbed.html',               desc: 'Equipment, securement, oversize loads and permits for flatbed and step deck.' },
    { id: 'policy-power-only',  section: 'course', track: 'equipment',  kind: 'policy', tag: 'POLICY',    title: 'Power Only Dispatching Policy', path: 'pages/policy-power-only.html',            desc: 'Trailer inspection, tracking and return rules for power only loads.' },
    { id: 'cargo-claims',       section: 'course', track: 'equipment',  kind: 'file',   tag: 'PDF',       title: 'Preventing Cargo Claims',       path: 'files/cargo-claims-presentation.pdf',     desc: '28-slide presentation on avoiding claims on reefer, flatbed and PO loads.' },

    { id: 'fmcsa-summary',      section: 'course', track: 'compliance', kind: 'summary', tag: 'SUMMARY',  title: 'FMCSA Compliance Manual 2026',  path: 'pages/fmcsa-summary.html',                desc: 'The 1,020-page manual in a 10-page summary: who is covered, drivers, testing, hours of service, vehicles, accidents and CSA.' },
    { id: 'dot-levels',         section: 'course', track: 'compliance', kind: 'ref',    tag: 'REFERENCE', title: 'DOT Inspection Levels',         path: 'pages/dot-levels.html',                   desc: 'What is examined in each of the Level I to VI roadside inspections.' },
    { id: 'cpdp-guide',         section: 'course', track: 'compliance', kind: 'file',   tag: 'PDF',       title: 'CPDP Eligibility Guide',        path: 'files/cpdp-eligibility-guide.pdf',        desc: 'FMCSA crash types eligible for a preventability review. 15 pages.' },

    // ---- Tools
    { id: 'email-answers',      section: 'tools',  group: 'inbox',      kind: 'tool',   icon: 'search', tag: 'SEARCH',    title: 'Email Quick Answers',    path: 'pages/email-answers.html',                desc: 'Type what is happening in the inbox and get one clear answer. Also checks if a setup sender is real.' },
    { id: 'fix-the-weight',     section: 'tools',  group: 'weights',    kind: 'tool',   icon: 'calc',  tag: 'CALCULATOR', title: 'Fix the Weight',         path: 'pages/fix-the-weight.html',               desc: 'Turn an overweight scale ticket into tandem and fifth-wheel moves, and a fuel limit.' },
    { id: 'axle-weights',       section: 'tools',  group: 'weights',    kind: 'tool',   icon: 'table', tag: 'TABLE',      title: 'Axle Weights by State',  path: 'pages/axle-weights.html',                 desc: 'Single and tandem axle limits and bridge settings for 53 ft trailers.' },
    { id: 'state-limits',       section: 'tools',  group: 'weights',    kind: 'tool',   icon: 'map',   tag: 'TABLE',      title: 'Legal Limits by State',  path: 'pages/state-limits.html',                 desc: 'Length, width, height, overhang and weight limits, state by state.' },
    { id: 'chain-laws',         section: 'tools',  group: 'weights',    kind: 'file',   icon: 'snow',  tag: 'PDF',        title: 'Chain Laws',             path: 'files/chain-laws.pdf',                    desc: 'Chain requirements by state for trailer and drive axles.' },
    { id: 'accident-test',      section: 'tools',  group: 'safety',     kind: 'tool',   icon: 'alert', tag: 'CHECK',      title: 'Post-Accident Test Check', path: 'pages/accident-test.html',              desc: 'Four questions to decide whether a drug test is required.' },

    // ---- Simulator
    { id: 'simulator',          section: 'simulator', hidden: true,     kind: 'sim',    tag: 'SIMULATOR',  title: 'Work Simulator',         path: 'pages/simulator.html',                    desc: 'Broker emails and driver Telegram chats arrive one by one. Decide, reply, and get scored.' }
  ]
};
