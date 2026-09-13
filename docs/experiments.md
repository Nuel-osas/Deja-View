# Historical experiments

These measurements came from earlier prototype versions on one computer. The portable packaging changes in D-j-View have not been benchmarked across these live sites. There is no universal ten-second guarantee.

| Experiment          | Observed result                                                          | Scope                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ameerbamigbayan.com | 15 pages; 37,027,696 downloaded bytes; capture and ZIP in 10.393 seconds | Frontend only; 25 unavailable source font URLs used fallback; four selected screenshot comparisons matched at the configured threshold; separate validation took 77.017 seconds |
| www.suiball.com     | 16 editable React components in a Next.js project; 103 local assets      | Capture followed by separate, site-specific migration work; retained Webflow/GSAP visual runtime; eight screenshot comparisons differed by 0–0.133% at the threshold            |

The first Suiball capture reported 5.457 seconds but left unresolved assets. It is not a complete-replica or Next.js-conversion benchmark. Asset-path fixes, conversion, compilation and verification were additional work.

Screenshot comparisons used the same Chrome and viewport with Pixelmatch threshold 0.15 and antialiasing excluded. Suiball videos and continuous CSS animations were synchronized for those comparisons. These selected views do not establish every interaction, frame or breakpoint is identical.

Downloaded site content, screenshots and personal filesystem paths are deliberately absent from this repository.
