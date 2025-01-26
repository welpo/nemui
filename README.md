<p align="center">
    <a href="https://nemui.osc.garden">
        <img src="https://raw.githubusercontent.com/welpo/nemui/main/app/logo.webp" width="250" alt="nemui logo">
    </a>
    <br>
    <a href="#contributing">
        <img src="https://img.shields.io/badge/prs-welcome-0?style=flat-square&labelcolor=202b2d&color=614088" alt="PRs welcome"></a>
    <a href="https://nemui.osc.garden">
        <img src="https://img.shields.io/website?url=https%3a%2f%2fnemui.osc.garden&style=flat-square&label=app&labelcolor=202b2d" alt="app status"></a>
    <a href="#license">
        <img src="https://img.shields.io/github/license/welpo/nemui?style=flat-square&labelcolor=202b2d&color=614088" alt="license"></a>
    <a href="https://github.com/welpo/git-sumi">
        <img src="https://img.shields.io/badge/clean_commits-git--sumi-0?style=flat-square&labelcolor=202b2d&color=614088" alt="clean commits"></a>
</p>

<p align="center">
    <a href="https://nemui.osc.garden">Try it now!</a>
</p>

<h3 align="center">Ease into your new sleep routine</h3>

I built nemui to gradually adjust my sleep schedule, knowing big changes (>30 minutes a night) are not ideal. nemui creates a day-by-day plan based on your current and target schedule, and a date to reach your goal.

The name combines <ruby>眠<rt>nemu</rt></ruby> (sleep) and <ruby>移<rt>i</rt></ruby> (transition), reading as <ruby>眠い<rt>nemui</rt></ruby> (sleepy) in Japanese.

## Demo

https://github.com/user-attachments/assets/26b282d4-352c-46ff-a182-e6710caca68b

[Give it a try!](https://nemui.osc.garden)

## Features

- Visual clock interface to set schedules intuitively
- Smart recommendations based on sleep science
- Handles time changes automatically:
  - Daylight saving time transitions
  - Partial-hour changes (e.g., [Lord Howe Island's 30-minute DST](https://www.atlasobscura.com/places/lord-howe-islands-time))
  - Shows adjusted wake times
- Calendar integration:
  - Export your plan to any calendar app (.ics)
  - Daily notifications before bedtime
- Private:
  - No accounts, no tracking
  - Works offline
  - All data stored locally
- Accessible: keyboard navigation and screen reader support

## Contributing

Please do! I'd appreciate bug reports, improvements (however minor), suggestions…

nemui uses vanilla JavaScript, HTML, and CSS. To run locally:

1. Clone the repository: `git clone https://github.com/welpo/nemui.git`
2. Navigate to the app directory: `cd nemui/app`
3. Start a local server: `python3 -m http.server`
4. Visit `http://localhost:8000` in your browser

The important files are:

- `index.html`: Basic structure
- `styles.css`: Styles
- `app.js`: Logic

## Need help?

Something not working? Have an idea? Let me know!

- Questions or ideas → [Start a discussion](https://github.com/welpo/nemui/discussions)
- Found a bug? → [Report it here](https://github.com/welpo/nemui/issues/new?&labels=bug&template=2_bug_report.yml)
- Feature request? → [Let me know](https://github.com/welpo/nemui/issues/new?&labels=feature&template=3_feature_request.yml)

## License

nemui is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License as published by the Free Software Foundation](./COPYING), either version 3 of the License, or (at your option) any later version.
