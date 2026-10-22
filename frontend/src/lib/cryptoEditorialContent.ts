import type { GuidePage } from './seoGrowthContent';

const date = '2026-10-23';

/** Editorial guides answer distinct search intents; claims link to official documentation. */
export const CRYPTO_EDITORIAL_ARTICLES: GuidePage[] = [
  {
    slug: 'how-to-build-blockchain-app-with-ai',
    title: 'How to build a blockchain app with AI without building the wrong thing',
    description: 'A practical, step-by-step guide to planning, building and verifying a blockchain app with AI, from the user journey to contracts and deployment.',
    eyebrow: 'Blockchain app builder guide', updated: date,
    intro: 'The fastest way to waste a month on a blockchain app is to begin with the chain. Begin with the person who needs to do something, then decide what, if anything, belongs on-chain.',
    visual: { src: '/images/crypto-guides/build-blockchain-app.png', alt: 'Editorial illustration of a developer planning a blockchain application at a desk', caption: 'Start with the workflow and the people using it, then decide where blockchain adds value.' },
    sections: [
      { heading: 'What are you really trying to build?', paragraphs: [
        '“Build me a crypto app” sounds specific until you try to draw the first screen. Is the user sending a payment, checking a balance, reviewing a governance proposal, or reading a research report? Each answer produces a different product, security boundary and data model. Write one sentence that names the user, the action and the result before touching an AI builder.',
        'For a first release, choose one narrow loop. A wallet activity viewer might connect a wallet, show recent transactions, explain a transaction in plain language and offer a link to the block explorer. That is testable. A “complete DeFi super app” is not. Ethereum’s developer documentation distinguishes the application interface from the smart contracts and network underneath it; keeping those layers separate makes the design easier to reason about.'
      ], bullets: ['Name the user and one job they need done.', 'Choose a network and explain why it fits that job.', 'List what must be on-chain, off-chain, or fetched from a third party.', 'Write the failure path: wrong network, rejected signature, delayed indexer and unavailable RPC.'] },
      { heading: 'Give the AI a brief it can verify', paragraphs: [
        'A useful prompt is closer to a product brief than a slogan: “Build a read-only wallet activity page for Ethereum. Let a visitor paste an address without connecting a wallet. Show recent transfers with network, token, amount, timestamp and explorer link. Explain loading, empty and RPC error states. Do not request a signature or store private keys. Use the existing repository and run its checks.” The details tell the builder what success looks like and what it must not do.',
        'Once the read-only path works, add the next operation as a separate task. If the app signs or sends transactions, the person must see the network, destination, amount and effect before they approve. A pretty confirmation dialog is not a substitute for the wallet’s actual transaction preview or contract review.'
      ] },
      { heading: 'Build the smallest working slice', paragraphs: [
        'Start with the page shell and realistic data states, then connect an approved RPC or indexer, and only then add wallet interactions. This order keeps the interface useful while the hardest external dependency is still unsettled. Ask the AI to identify where data came from and to label stale or incomplete results. RPC interfaces expose methods; they do not automatically provide a polished historical analytics dataset.',
        'Keep generated changes in a repository you can inspect. Review dependency additions, server routes, environment variable names and contract addresses. A deployed page is evidence that a bundle ran, not evidence that a financial action is safe. Require tests and a production build before presenting the result as ready.'
      ], bullets: ['Verify loading, empty, error and disconnected states.', 'Test on a small screen and with keyboard navigation.', 'Keep API keys and provider secrets off the client.', 'Review every write operation with a human before enabling it.'] },
      { heading: 'Where a free blockchain app builder fits', paragraphs: [
        'A free plan can be a good way to prove the interface and the first data connection. “Free” does not mean that deployed infrastructure, RPC quotas, audits, transactions or paid provider services disappear. Budget for the network and operations separately. Choose a builder that leaves you with understandable code and a route to maintain it, not just a demonstration video.',
        'Xroga is designed to take a plain-language outcome into repository-aware work. You can describe the app, inspect the changes and verify the build. The chain, data provider and connected accounts still need to be selected and authorised for the actual product; Xroga does not create a working integration by pretending a connection exists.'
      ] },
      { heading: 'The launch checklist nobody should skip', paragraphs: [
        'Before announcing a launch, walk through one real user journey on the intended network with a small amount of value. Record the transaction hash or read result, inspect logs, verify the exact deployed commit and write down how to stop or roll back the interface if something fails. If a smart contract holds assets, independent security review and a response plan are more important than a launch graphic.',
        'The simple rule: make each claim as narrow as the evidence. “The UI renders and the test transaction succeeded on a test network” is useful. “The dApp is secure and production-ready” is not something a builder can infer from a green build.'
      ] },
    ],
    related: ['/crypto', '/blog/smart-contract-security-checklist', '/blog/crypto-dashboard-data-guide', '/learn/production-readiness-checklist'],
    sources: [
      { label: 'Ethereum: introduction to decentralized applications', href: 'https://ethereum.org/developers/docs/dapps/' },
      { label: 'Ethereum: JSON-RPC API', href: 'https://ethereum.org/developers/docs/apis/json-rpc/' },
      { label: 'Ethereum: interacting with smart contracts', href: 'https://ethereum.org/developers/docs/smart-contracts/interacting/' },
    ],
  },
  {
    slug: 'smart-wallet-ux-account-abstraction',
    title: 'Why your Web3 app loses people at the wallet screen',
    description: 'Design a clearer wallet connection and signing journey for a Web3 app, with practical guidance on account abstraction, recovery and safer prompts.',
    eyebrow: 'AI Web3 app builder guide', updated: date,
    intro: 'The first wallet screen is not an onboarding detail. It is the point where a curious visitor decides whether your product understands the risk you are asking them to take.',
    visual: { src: '/images/crypto-guides/smart-wallet.png', alt: 'Editorial illustration of a product designer reviewing a wallet connection journey', caption: 'A trustworthy wallet experience explains the action before requesting a signature.' },
    sections: [
      { heading: 'Ask for a wallet only when the job requires it', paragraphs: [
        'A visitor who wants to read a proposal, inspect a token or preview a dashboard should often be able to do that without connecting anything. Delaying the wallet prompt gives them context and lowers the chance they approve a request they do not understand. Reserve connection for the point where identity, ownership or a transaction actually matters.',
        'Before showing Connect, say what the action unlocks. After connecting, show the current network and a shortened address with a way to view the full address. Make it obvious when data is a read-only preview and when the next click will ask the wallet to sign or transact.'
      ] },
      { heading: 'Treat signatures as a product moment, not a technical hurdle', paragraphs: [
        '“Sign to continue” hides the most important question: what is the user authorising? A message signature, token approval and on-chain transaction are different operations with different consequences. Use plain language above the wallet request: what changes, what does not change and what the user should expect to see in their wallet.',
        'Build rejection and interruption into the normal journey. People switch networks, close a wallet, reject a prompt or return after the session expires. The interface should recover without charging twice, losing form state or pretending an unfinished action succeeded. Ethereum’s contract-interaction documentation makes clear that writing to a contract involves a transaction rather than a simple website click.'
      ], bullets: ['State the exact operation before opening the wallet.', 'Show network, amount, recipient and any token approval scope.', 'Provide a safe cancel path and a retry that cannot duplicate a payment.', 'Link to an explorer only after a real transaction hash exists.'] },
      { heading: 'Where account abstraction helps', paragraphs: [
        'Account abstraction can support a more flexible account experience: programmable validation, different recovery approaches and transaction sponsorship, depending on the design. It does not make risk disappear. A recovery mechanism introduces its own trust assumptions, and gas sponsorship introduces a payer who needs limits and abuse protection.',
        'For a first release, decide the recovery story before adding convenience features. Who can restore access, how is that authority changed, and what happens if the recovery service goes away? Explain those answers in the product instead of calling the wallet “passwordless” and moving on.'
      ] },
      { heading: 'A useful AI prompt for a wallet flow', paragraphs: [
        'Try: “In the existing Web3 app, keep the public dashboard readable without a wallet. Add a Connect action only to the saved-watchlist workflow. Before a signature, explain why it is needed and display the selected chain. Handle wrong chain, rejection, expiry and disconnect without losing the watchlist draft. Do not add transaction signing. Show me the code paths and tests.”',
        'That prompt gives the AI a bounded job and an explicit prohibition. If you later add token approvals or payments, make those separate reviewable tasks with their own threat model and test cases. A dApp builder should help you move faster through implementation, not erase the product decisions that keep users safe.'
      ] },
      { heading: 'Check the experience with someone who has never used your app', paragraphs: [
        'Watch one person complete the journey without coaching. Ask them what they believe the wallet will do before they click. If their answer differs from the actual operation, rewrite the screen. Then test on a phone, with a slow connection and with the wallet unavailable. This is where small trust failures become visible.',
        'A successful wallet flow ends with a clear outcome: an address connected, a transaction pending, a transaction confirmed, or nothing changed. Those states should never be visually interchangeable.'
      ] },
      { heading: 'Should a Web3 app use a smart wallet?', paragraphs: [
        'Sometimes. If your users need recovery, recurring authorised actions or sponsored fees, a smart-account design may remove a real barrier. If the app only displays public data, adding account machinery can create a barrier instead. The decision belongs to the user journey and risk model, not a trend report.',
        'Compare a conventional wallet flow with the proposed smart-wallet flow using the same task. Note how many steps a first-time user takes, which keys or recovery factors exist, who can change them, and who pays for transactions. Have security and support review the recovery path. The easiest first-use experience can be the hardest one to support after a lost device if the recovery story is vague.'
      ] },
    ],
    related: ['/crypto', '/blog/how-to-build-blockchain-app-with-ai', '/blog/smart-contract-security-checklist'],
    sources: [
      { label: 'Ethereum: account abstraction roadmap', href: 'https://ethereum.org/roadmap/account-abstraction/' },
      { label: 'Ethereum: interacting with smart contracts', href: 'https://ethereum.org/developers/docs/smart-contracts/interacting/' },
    ],
  },
  {
    slug: 'stablecoin-payment-app-guide',
    title: 'How to build a stablecoin payment app people can actually reconcile',
    description: 'A practical crypto app builder guide for stablecoin checkout, payment state, network choice, retries, refunds and reconciliation.',
    eyebrow: 'Crypto app builder guide', updated: date,
    intro: 'A “Pay with crypto” button takes an afternoon to mock up. Knowing which order was paid, whether the money arrived and what to do when it did not is the actual product.',
    visual: { src: '/images/crypto-guides/stablecoin-payments.png', alt: 'Editorial illustration of a merchant planning a stablecoin checkout and payment ledger', caption: 'The hard part of a payment product is the ledger and recovery path, not the button.' },
    sections: [
      { heading: 'Start from the merchant’s ledger', paragraphs: [
        'Before selecting a chain or wallet provider, write down the order states: created, awaiting payment, observed, confirmed, expired, refunded and disputed or manually resolved. Decide which state lets the merchant deliver the goods. An observed transaction can still be pending or on the wrong network; a screenshot from a customer is not a settlement signal.',
        'Give each order an immutable identifier and link it to exactly one intended amount, asset and network. Record provider events and transaction identifiers separately. That separation makes reconciliation possible when a webhook is delayed, a customer retries or a provider sends the same event twice.'
      ], bullets: ['Define accepted assets and networks explicitly.', 'Set a quote expiry and explain what happens afterward.', 'Make webhook and confirmation handling idempotent.', 'Provide an operator view for unmatched or underpaid transfers.'] },
      { heading: 'Choose a settlement path you can support', paragraphs: [
        'Some teams need a wallet-to-wallet transfer and manual fulfilment; others need a provider-backed checkout, conversion and reporting. The right choice depends on the merchant’s operational and compliance requirements. Solana’s payments documentation describes the components of a payment integration, including transaction creation and confirmation. Its finance documentation gives broader context, but neither replaces a merchant’s own accounting and legal review.',
        'Do not promise “instant, free payments” as a general fact. Fees, network conditions, custody choices, conversion and provider charges vary. If you advertise a low-cost path, show which network, asset and route it refers to and keep the figure current.'
      ] },
      { heading: 'Make the customer journey honest', paragraphs: [
        'A checkout should display the exact amount, currency, network, destination and expiry before a wallet opens. If the customer chooses the wrong network, show a useful warning before they send. If the transaction is submitted, do not call the order paid until your chosen confirmation rule is met. Provide a transaction link and a clear “still checking” state rather than a success animation based only on a button click.',
        'Refunds deserve their own design. Record who approved a refund, the target address, the asset, the network and the resulting transaction. A refund is a new transfer, not an edit to the original payment.'
      ] },
      { heading: 'What to ask an AI crypto builder to make', paragraphs: [
        'A useful first brief is: “Create a stablecoin checkout prototype with test data. Show order amount, asset, network, quote expiry and a pending confirmation state. Build a server-side order ledger with idempotent payment-event handling, but disable real transfers until provider credentials and test-network verification are supplied. Include an operator screen for exceptions and tests for duplicate events.”',
        'The word “prototype” matters. It stops the interface from implying that a payment provider is connected when it is not. Move to real payments only when the business owner has authorised the account, confirmed the jurisdictional requirements and tested the entire fulfilment and refund path with a real small-value transaction.'
      ] },
      { heading: 'Launch by reconciling, not by celebrating', paragraphs: [
        'For the pilot, compare the order ledger against the network or provider statement each day. Count missing confirmations, duplicated events, wrong-asset attempts and manual interventions. Those are better early measures than the number of clicks on the Pay button.',
        'A payment app is trustworthy when the merchant can explain every order state and recover from the ordinary mess of real transactions. That is a stronger launch criterion than a polished checkout screenshot.'
      ] },
      { heading: 'What about partial payments and customer support?', paragraphs: [
        'They are not edge cases once people are paying from different wallets. A customer may send less than the quote, send the right amount after the quote expires, or send the right asset on a different network. Decide in advance whether each case receives a refund, a manual review or a new quote. Do not silently mark an order paid because the amount is “close enough.”',
        'Give support staff a private view of the order identifier, expected payment, observed transfer, network, confirmation state and timestamps. They should be able to explain the discrepancy without asking customers to expose seed phrases or private keys. Publish a support route and a realistic response expectation before taking the first real payment. If local rules require licensing, reporting or customer verification, resolve that with qualified counsel rather than asking a code assistant to decide it.'
      ] },
    ],
    related: ['/crypto', '/blog/how-to-build-blockchain-app-with-ai', '/blog/smart-contract-security-checklist'],
    sources: [
      { label: 'Solana: payments documentation', href: 'https://solana.com/docs/payments' },
      { label: 'Solana: finance documentation', href: 'https://solana.com/docs/finance' },
    ],
  },
  {
    slug: 'smart-contract-security-checklist',
    title: 'The smart contract security checklist an AI dApp builder cannot skip',
    description: 'A plain-language smart contract and dApp security checklist covering permissions, external calls, oracle data, tests and launch controls.',
    eyebrow: 'dApp builder AI security guide', updated: date,
    intro: 'AI can write a contract that compiles. That tells you very little about what happens when someone tries to break its assumptions.',
    visual: { src: '/images/crypto-guides/contract-security.png', alt: 'Editorial illustration of two developers reviewing smart contract code and test results', caption: 'A contract review starts with assets, permissions and failure paths—not a green compile badge.' },
    sections: [
      { heading: 'Write down what is at risk', paragraphs: [
        'A contract that stores votes has a different risk profile from one that moves customer funds. List the assets, privileged roles, upgrade powers and external dependencies before writing a security prompt. Ask who can pause, withdraw, change fees, swap an oracle, upgrade implementation code or alter an allowlist. If the answer is “admin,” define who controls that account and how it is recovered.',
        'Ethereum’s smart contract security guidance emphasizes that contracts are public, interactions can be adversarial and failures may be hard to reverse. The first review should therefore be a threat model, not a linter report.'
      ] },
      { heading: 'Review the boundaries people overlook', paragraphs: [
        'Permission checks must live in contract or trusted server logic, not just behind a hidden frontend button. External calls can introduce reentrancy and unexpected behaviour. Oracle data can be stale or manipulated, and a price shown in a UI is not necessarily the value the contract uses. Upgradeability can fix errors, but it also creates an authority that must be constrained and disclosed.',
        'Use the OWASP Smart Contract Security Verification Standard as a review framework. It does not certify your contract; it gives you a structured set of questions about architecture, access control, arithmetic, external interactions and deployment. Turn those questions into tests tied to your actual contract.'
      ], bullets: ['Can an unprivileged account reach a privileged function?', 'Can callbacks or external calls change state in an unexpected order?', 'What happens with stale, missing or extreme oracle data?', 'Can a paused system still let users exit safely?', 'Does an upgrade or admin key have a documented owner and delay?'] },
      { heading: 'Ask AI for tests that try to disprove the design', paragraphs: [
        'Do not stop at a happy-path test that deposits and withdraws once. Ask for invariant tests: total liabilities cannot exceed assets; one user cannot withdraw another user’s funds; a rejected signature changes no state; a duplicate event does not pay twice. Fuzz boundary inputs and test the role transitions that happen rarely but matter most.',
        'A stronger prompt is: “Review this contract as an adversary. List assets, roles, external dependencies and invariants. Write failing tests for the highest-risk scenarios before suggesting patches. Do not claim an audit or security guarantee. Explain which findings need a human reviewer.” That turns the AI into a useful assistant while keeping its limitations visible.'
      ] },
      { heading: 'Separate app security from contract security', paragraphs: [
        'Even a carefully reviewed contract can sit behind a compromised web interface. Check that the frontend displays the correct chain, contract address and transaction destination. Protect API keys and admin tools. Make the deployment process reproducible, pin important dependencies and verify the deployed address against the reviewed source.',
        'If the app uses a price feed, read the provider’s guidance for that specific feed and network. Chainlink documents feed data and usage; your product still needs to handle stale updates and the consequences of an unavailable answer. Security is a system property, not one Solidity file.'
      ] },
      { heading: 'Go live with a limit and a response plan', paragraphs: [
        'A bounded pilot gives the team a chance to observe real behaviour with limited exposure. Decide who monitors events, how incidents are reported, when to pause, and how users will hear about a problem. If a contract will hold meaningful value, independent review should be part of the launch decision. A code generator cannot confer that assurance.',
        'The most useful release note is candid: what was tested, what was reviewed independently, which network and contract address are live, and what remains unknown. Users deserve that clarity more than a generic “audited by AI” badge.'
      ] },
      { heading: 'What should a non-developer ask before approving a launch?', paragraphs: [
        'Ask for a short, readable explanation of what the contract controls, who can change it, which assets it can move and what a user can recover if something fails. Ask to see the exact address and network, not a screenshot of source code alone. Ask which tests failed before repair and which risks remain after the repair. If those answers cannot be produced, postpone the launch.',
        'Security work also has a time dimension. A contract may be reviewed today and depend on a feed, multisignature or upgrade key that changes tomorrow. Put those dependencies on an operational checklist with named owners. Record emergency contacts and the steps for communicating with affected users. None of this is glamorous, but a practical response plan matters more than a security adjective in marketing copy.'
      ] },
    ],
    related: ['/crypto', '/blog/how-to-build-blockchain-app-with-ai', '/blog/smart-wallet-ux-account-abstraction', '/security'],
    sources: [
      { label: 'Ethereum: smart contract security', href: 'https://ethereum.org/developers/docs/smart-contracts/security' },
      { label: 'OWASP: Smart Contract Security Verification Standard', href: 'https://scs.owasp.org/SCSVS/' },
      { label: 'Chainlink: Data Feeds documentation', href: 'https://docs.chain.link/data-feeds' },
    ],
  },
  {
    slug: 'crypto-dashboard-data-guide',
    title: 'Build a crypto dashboard people trust, not another wall of charts',
    description: 'Design an AI-built crypto dashboard with clear metric definitions, on-chain data provenance, freshness indicators and useful decisions.',
    eyebrow: 'AI crypto dashboard guide', updated: date,
    intro: 'A dashboard is not valuable because it has more charts. It is valuable when someone can make a decision and understand how each number was produced.',
    visual: { src: '/images/crypto-guides/crypto-dashboard.png', alt: 'Editorial illustration of an analyst planning a crypto dashboard with data provenance and clear metrics', caption: 'Make the source, time window and uncertainty visible alongside the metric.' },
    sections: [
      { heading: 'Pick a question, not a chart library', paragraphs: [
        'Consider a treasury team that wants to know: How much liquid runway do we have, and what changed this week? That question leads to balances by asset and network, valuation assumptions, inflows, outflows and a comparison window. A generic collection of candlesticks and token logos might look impressive but would not answer it.',
        'Write a short metric contract for each number: source, definition, network, unit, time zone, refresh cadence, exclusions and owner. “Active wallets” can mean unique addresses that sent a transaction, held a token, signed into an app or interacted with a contract. Those are not interchangeable.'
      ] },
      { heading: 'Know the difference between chain data and interpreted data', paragraphs: [
        'A JSON-RPC endpoint lets an app query network state and submit transactions. Historical dashboards often also need an indexer, analytics store or provider that transforms events into a usable dataset. The transformation introduces assumptions: token decimals, duplicate events, chain reorganisations and contract upgrades. If the dashboard cannot explain those assumptions, users cannot judge a surprising number.',
        'Ethereum’s data and analytics documentation outlines different ways to access and analyse chain information. Choose one appropriate to the question, then expose the provider and last successful update in the interface. If a source is down, keep the previous value labeled stale instead of quietly showing it as live.'
      ] },
      { heading: 'Handle price and value carefully', paragraphs: [
        'A wallet may hold ten tokens, but “portfolio value” adds another layer of pricing and liquidity assumptions. State which quote currency, price source and timestamp were used. If a token has no reliable price, show the balance without inventing a fiat value. If the product supports decisions involving money, test how it behaves when a feed is missing, old or anomalous.',
        'Chainlink’s data feed documentation is useful when evaluating oracle-fed values in a contract or app. It is not a promise that every asset or metric is available or suitable for every use. Read the feed details for the specific network and use case.'
      ] },
      { heading: 'A prompt for an AI dashboard builder', paragraphs: [
        'Try this: “Build a read-only treasury dashboard for one Ethereum address. Show asset balances, seven-day inflow and outflow, and a transaction list. For each metric, display source, unit, time window and last updated time. Use mock data until I authorise a provider; visibly label the mock state. Include loading, empty, stale, partial-error and mobile layouts. Do not add trading or wallet signing.”',
        'After the interface is useful, connect one data source and compare its output with a block explorer or independent query for several real examples. Only then add more networks or more complex derived metrics. The goal is not a large dashboard; it is a trustworthy one.'
      ] },
      { heading: 'Make the next action obvious', paragraphs: [
        'A good dashboard does more than present numbers. It helps a person investigate why a balance changed, export the relevant transactions, inspect the address and decide who should follow up. Give each chart an accessible text summary and a direct path to the underlying records.',
        'If a user can explain the metric, trace the source and act on an anomaly without asking the builder what it meant, the dashboard is doing its job.'
      ] },
      { heading: 'Which metrics belong on the first screen?', paragraphs: [
        'Only those that help the named user make the next decision. A treasury manager may want spend, runway and unusual transfers. A researcher may want a protocol’s activity, retention and contract changes. A customer-support team may need failed deposits and unmatched transactions. Combining all three audiences into one default screen creates noise and makes permissions harder to reason about.',
        'Sketch the first screen on paper: one headline question, three to five numbers, one trend and one table of underlying records. For each number, write a one-line definition in the interface. Let deeper views provide the breakdowns. Then interview a user with the real data and ask what they would do differently after seeing the page. If the answer is “nothing,” the next iteration probably needs a better question, not another chart.'
      ] },
    ],
    related: ['/crypto', '/blog/how-to-build-blockchain-app-with-ai', '/build/dashboard'],
    sources: [
      { label: 'Ethereum: JSON-RPC API', href: 'https://ethereum.org/developers/docs/apis/json-rpc/' },
      { label: 'Ethereum: data and analytics', href: 'https://ethereum.org/developers/docs/data-and-analytics' },
      { label: 'Chainlink: Data Feeds documentation', href: 'https://docs.chain.link/data-feeds' },
    ],
  },
];
