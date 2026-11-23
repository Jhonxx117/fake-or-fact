// ===== CONTENU À REMPLIR (60 cartes + 20 titres) =====
// type : "reliable" | "neutral" | "redflag"
// category : Source | Evidence | Tone | Visual | Date
// id = code imprimé en petit sur la carte (ex. S01). Doit être unique.
const CARDS = [
  {id:"S01",category:"Source",text:"Published by a national news agency, author named.",type:"reliable",why:"A named author and an established outlet can be checked."},
  {id:"S02",category:"Source",text:"Shared by 'a friend of a friend who works there'.",type:"redflag",why:"Anonymous second-hand source: nobody can verify it."},
  {id:"E01",category:"Evidence",text:"Includes a link to the original study.",type:"reliable",why:"You can read the study yourself."},
  {id:"E02",category:"Evidence",text:"'Scientists say' (no names given).",type:"redflag",why:"Vague authority: which scientists?"},
  {id:"T01",category:"Tone",text:"Calm, factual wording.",type:"reliable",why:"No attempt to trigger an emotional reaction."},
  {id:"T02",category:"Tone",text:"SHOCKING!!! You won't BELIEVE this!!!",type:"redflag",why:"Emotional bait designed to be shared, not checked."},
  {id:"V01",category:"Visual",text:"Photo with caption, date and photographer credit.",type:"reliable",why:"The image can be traced."},
  {id:"V02",category:"Visual",text:"Blurry photo, no caption, found on a forum.",type:"redflag",why:"Origin unknown: it may be old or edited."},
  {id:"D01",category:"Date",text:"Published today, updated this morning.",type:"reliable",why:"Recent and maintained."},
  {id:"D02",category:"Date",text:"No date. 'Happened last week'.",type:"redflag",why:"Without a date, the news may be years old."},
  {id:"N01",category:"Tone",text:"Short post, one emoji.",type:"neutral",why:"Neutral: says nothing about reliability."}
];
const HEADLINES = [
  "City bans cars from the centre every Sunday",
  "New study links sleep to exam results",
  "Famous streamer announces he is quitting the internet"
];