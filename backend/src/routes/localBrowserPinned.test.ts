import test from 'node:test';
import assert from 'node:assert/strict';
import {rankPinnedByQuery,changeToolsNote} from './localBrowser.js';

test('pinned tools are ordered by how well their names match the search, then by their original order',()=>{
  const tools=['MONID_BALANCE','MONID_DISCOVER','MONID_DISPUTE','MONID_RUN','MONID_STOP_RUN','MONID_FEEDBACK'].map(slug=>({slug}));
  assert.deepEqual(rankPinnedByQuery('run a free endpoint',tools).slice(0,2).map(t=>t.slug),['MONID_RUN','MONID_STOP_RUN']);
  assert.equal(rankPinnedByQuery('discover data endpoints',tools)[0]!.slug,'MONID_DISCOVER');
  assert.deepEqual(rankPinnedByQuery('zz',tools).map(t=>t.slug),tools.map(t=>t.slug),'no match keeps the pinned order');
  assert.equal(rankPinnedByQuery('anything',[]).length,0);
});

test('the note about change tools names them without any definition, and is absent when there are none',()=>{
  assert.equal(changeToolsNote([]),undefined);
  const note=changeToolsNote([{slug:'MONID_RUN'},{slug:'MONID_DISCOVER'}])!;
  assert.match(note,/MONID_RUN, MONID_DISCOVER/);
  assert.match(note,/plugin_action_search/);
  assert.match(note,/owner approves each call/);
  assert.ok(changeToolsNote(Array.from({length:30},(_,i)=>({slug:`T${i}`})))!.split(',').length<=11,'at most ten names');
});

test('the active-run limit is thirteen (a parent and twelve workers) unless an operator provisions 4 to 24',async()=>{
  const {activeRunLimit}=await import('./localBrowser.js');
  assert.equal(activeRunLimit({}),13);
  for(const [value,expected] of [['7',7],['12',12],['4',4],['24',24],['3',13],['25',13],['6.5',13],['abc',13],['',13]] as const)assert.equal(activeRunLimit({XROGA_LOCAL_BROWSER_MAX_ACTIVE_RUNS:value}),expected,value);
});

test('reads and changes inside the owner own app run without a card; outbound, public, destructive and financial calls do not',async()=>{
  const {autoApprovesCall}=await import('./localBrowser.js');
  for(const slug of ['MONID_DISCOVER','MONID_RUN','GOOGLESHEETS_LIST_ROWS'])assert.equal(autoApprovesCall('read',slug),true,slug);
  for(const slug of ['GOOGLESHEETS_CREATE_ROW','NOTION_UPDATE_PAGE','GMAIL_CREATE_EMAIL_DRAFT','CUSTOM_X_MONID_MONID_RUN'])assert.equal(autoApprovesCall('change',slug),true,slug);
  for(const slug of ['GMAIL_SEND_EMAIL','SLACK_SEND_MESSAGE','TWITTER_CREATE_POST','CALENDAR_INVITE_ATTENDEES','FACEBOOK_PUBLISH_PAGE_POST'])assert.equal(autoApprovesCall('change',slug),false,slug);
  assert.equal(autoApprovesCall('read','X_LIST',{XROGA_LOCAL_BROWSER_AUTO_APPROVE:'off'}),false);
});

test('a request that names a connected app is narrowed to that app; a general request is not',async()=>{
  const {namedToolkits}=await import('./localBrowser.js');
  const toolkits=[
    {toolkit:'notion',name:'Notion',connected:true},
    {toolkit:'gmail',name:'Gmail',connected:true},
    {toolkit:'googlesheets',name:'Google Sheets',connected:true},
    {toolkit:'slack',name:'Slack',connected:false},
  ];
  assert.deepEqual([...namedToolkits('list my recent pages in Notion',toolkits)],['notion']);
  assert.deepEqual([...namedToolkits('read rows from my google sheets spreadsheet',toolkits)],['googlesheets']);
  assert.deepEqual([...namedToolkits('notion and gmail',toolkits)].sort(),['gmail','notion']);
  // Not connected, or no app named: nothing narrows the search.
  assert.deepEqual([...namedToolkits('post to slack',toolkits)],[]);
  assert.deepEqual([...namedToolkits('what is the TVL of aave',toolkits)],[]);
});

test('the owner permission for an app decides what runs without a card',async()=>{
  const {autoApprovesCall}=await import('./localBrowser.js');
  assert.equal(autoApprovesCall('read','NOTION_FETCH_PAGE',{},'always_ask'),false);
  assert.equal(autoApprovesCall('change','NOTION_CREATE_PAGE',{},'always_ask'),false);
  for(const mode of ['low_risk','full_access'] as const){
    assert.equal(autoApprovesCall('read','NOTION_FETCH_PAGE',{},mode),true,mode);
    assert.equal(autoApprovesCall('change','NOTION_CREATE_PAGE',{},mode),true,mode);
    // Sending, publishing and the like keep their card even with full access.
    assert.equal(autoApprovesCall('change','GMAIL_SEND_EMAIL',{},mode),false,mode);
  }
  assert.equal(autoApprovesCall('read','NOTION_FETCH_PAGE',{},'read_only'),true);
});
