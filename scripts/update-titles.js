#!/usr/bin/env node

/**
 * Script to generate and update song titles from filenames
 * Run with: node scripts/update-titles.js
 */

const BASE_URL = 'https://pznmptudgicrmljjafex.supabase.co/functions/v1/make-server-473d7342';
const AUTH_HEADERS = {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g',
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bm1wdHVkZ2ljcm1samphZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDE4ODUsImV4cCI6MjA3OTg3Nzg4NX0.syu1bbr9OJ5LxCnTrybLVgsjac4UOkFVdAHuvhKMY2g',
  'Content-Type': 'application/json'
};

/**
 * Clean up filename to generate a proper title
 */
function generateTitle(fileName) {
  let title = fileName;
  
  // Remove file extension
  title = title.replace(/\.(wav|mp3|flac|m4a|aiff?)$/i, '');
  
  // Remove track numbers at the start (e.g., "01-", "12-")
  title = title.replace(/^\d{1,2}[-_\s]+/, '');
  
  // Remove artist/album tags
  title = title.replace(/[_\s]*th3scr1b3[_\s]*/gi, ' ');
  title = title.replace(/[_\s]*afterlife[_\s\.]*/gi, '');
  title = title.replace(/[_\s]*scr1b3[_\s]*/gi, '');
  
  // Remove mastering/mix tags
  title = title.replace(/[_\s]*mastered[_\s]*/gi, '');
  title = title.replace(/_mas$/gi, '');
  title = title.replace(/_m$/gi, '');
  title = title.replace(/\s+m$/gi, '');
  title = title.replace(/[_\s]*master\b/gi, '');
  title = title.replace(/[_\s]*mixdown[_\s]*/gi, '');
  title = title.replace(/[_\s]*_mix[_\s]*\d*/gi, '');
  title = title.replace(/[_\s]*relay[_\s]*/gi, '');
  title = title.replace(/[_\s]*splitter[_\s]*/gi, '');
  title = title.replace(/[_\s]*abbyroad[_\s]*/gi, '');
  title = title.replace(/[_\s]*abby[_\s]*road[_\s]*/gi, '');
  title = title.replace(/_sat$/gi, '');
  title = title.replace(/_sr$/gi, '');
  title = title.replace(/_cyro[_\s]*/gi, '');
  title = title.replace(/_riyni$/gi, '');
  title = title.replace(/_newm$/gi, '');
  title = title.replace(/_exhale$/gi, '');
  title = title.replace(/_normal\d*$/gi, '');
  title = title.replace(/_neews$/gi, '');
  
  // Remove version indicators
  title = title.replace(/[_\s]*v\d+[_\s]*/gi, '');
  title = title.replace(/_\d+$/gi, '');
  title = title.replace(/\s+\d+$/gi, '');
  title = title.replace(/\.\d+$/gi, '');
  title = title.replace(/[_\s]*\(\d+\)[_\s]*/gi, '');
  title = title.replace(/[_\s]*ver[_\s]*\d*/gi, '');
  
  // Remove quality/format tags
  title = title.replace(/[_\s]*\d{2,3}(kbps|k)?[_\s]*/gi, '');
  title = title.replace(/[_\s]*\d{4,5}[_\s]*/g, ''); // Remove sample rates like 48000
  title = title.replace(/[_\s]*Precise[_\s]*Depth[_\s]*Presence[_\s]*/gi, '');
  title = title.replace(/[_\s]*Sunroof[_\s]*/gi, '');
  title = title.replace(/[_\s]*Clear[_\s]*Sky[_\s]*/gi, '');
  title = title.replace(/[_\s]*\d+pct[_\s]*/gi, '');
  
  // Remove common prefixes
  title = title.replace(/^Copy of /i, '');
  title = title.replace(/^G Chauvin FLoyd[-_\s]*/i, '');
  title = title.replace(/^ds?'?s?s? bangerz[-_\s]*\d*[-_\s]*/i, '');
  
  // Remove misc tags in parentheses/brackets
  title = title.replace(/\s*\([^)]*\)\s*/g, ' ');
  title = title.replace(/\s*\[[^\]]*\]\s*/g, ' ');
  
  // Remove trailing tags after underscore or space
  title = title.replace(/[_\s]+(feat|ft)[_\s]+.*$/i, '');
  title = title.replace(/[_\s]+demo[_\s]*$/i, '');
  title = title.replace(/[_\s]+cover[_\s]*$/i, '');
  title = title.replace(/[_\s]+Entire$/i, '');
  title = title.replace(/[_\s]+Bounced$/i, '');
  title = title.replace(/[_\s]+download$/i, '');
  title = title.replace(/[_\s]+real$/i, '');
  
  // Handle special filename patterns (before other cleanup)
  const specialTitles = {
    'sstack': '80s Stack',  // After 80 is stripped
    '80sstack': '80s Stack',
    'dashboardoflife': 'Dashboard of Life',
    'itsgonnabealright': "It's Gonna Be Alright",
    'noservice': 'No Service',
    'speedofpain': 'Speed of Pain',
    'thelight': 'The Light',
    'wysiwyg': 'WYSIWYG',
    'hard2ignore': 'Hard to Ignore',
    'stamerica': 'St. America',
    'comeondance': 'Come On Dance',
    'feelgood': 'Feel Good',
    'getghost': 'Get Ghost',
    'getnaughty': 'Get Naughty',
    'gethighwme': 'Get High with Me',
    'otwt': 'Only Time Will Tell',
    'olb': 'OLB',
    'neends': 'Never Ends',
    'neverends': 'Never Ends',
    'xzinbit': 'Xzibit',
    'prevailm': 'Prevail',
  };
  
  // Check for special patterns
  const lowerTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [pattern, replacement] of Object.entries(specialTitles)) {
    if (lowerTitle.startsWith(pattern)) {
      title = title.replace(new RegExp(pattern, 'i'), replacement);
    }
  }
  
  // More cleanup for specific patterns
  title = title.replace(/[_\s]*cover?[_\s]*$/i, '');
  title = title.replace(/[_\s]*co$/i, '');
  title = title.replace(/[_\s]*template$/i, '');
  title = title.replace(/[_\s]*realmix$/i, '');
  title = title.replace(/[_\s]*fore$/i, ' Forever');
  title = title.replace(/[_\s]+remix[_\s]+untitled[_\s]*/i, ' Remix ');
  title = title.replace(/[_\s]*m2$/i, '');
  
  // Remove special characters and clean up
  title = title.replace(/_/g, ' ');
  title = title.replace(/-/g, ' ');
  title = title.replace(/\s*@\s*/g, '');
  title = title.replace(/\.+/g, ' ');
  
  // Clean up multiple spaces
  title = title.replace(/\s+/g, ' ').trim();
  
  // Title case (capitalize first letter of each word)
  title = title.split(' ').map((word, index) => {
    if (word.length === 0) return word;
    // Keep certain words lowercase (unless first word)
    const lowercaseWords = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    if (index > 0 && lowercaseWords.includes(word.toLowerCase())) {
      return word.toLowerCase();
    }
    // Keep all-caps words (acronyms)
    if (word === word.toUpperCase() && word.length <= 5) {
      return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
  
  // Ensure first letter is capitalized
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  
  return title || fileName; // Fallback to fileName if title is empty
}

async function loadAnalyses() {
  const response = await fetch(`${BASE_URL}/analyses/load`, {
    headers: AUTH_HEADERS
  });
  const data = await response.json();
  return data.analyses || [];
}

async function updateAnalysis(analysis) {
  // Delete then re-save to update (since save skips existing)
  const deleteResponse = await fetch(`${BASE_URL}/analyses/${analysis.id}`, {
    method: 'DELETE',
    headers: AUTH_HEADERS
  });
  
  if (!deleteResponse.ok) {
    return { error: 'Failed to delete for update' };
  }
  
  // Now save the updated version
  const saveResponse = await fetch(`${BASE_URL}/analyses/save`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ analyses: [analysis] })
  });
  return saveResponse.json();
}

async function main() {
  console.log('Loading analyses...');
  const analyses = await loadAnalyses();
  console.log(`Found ${analyses.length} songs\n`);
  
  // Preview mode - show what titles would be generated
  const preview = process.argv.includes('--preview');
  const updateAll = process.argv.includes('--update');
  
  if (!preview && !updateAll) {
    console.log('Usage:');
    console.log('  node scripts/update-titles.js --preview   # Show generated titles');
    console.log('  node scripts/update-titles.js --update    # Update all titles in database');
    console.log('');
  }
  
  const results = analyses.map(a => ({
    id: a.id,
    fileName: a.fileName,
    currentTitle: a.title,
    newTitle: generateTitle(a.fileName)
  }));
  
  if (preview || (!preview && !updateAll)) {
    console.log('Title Preview:\n');
    console.log('fileName -> title');
    console.log('='.repeat(80));
    results.slice(0, 50).forEach(r => {
      console.log(`${r.fileName}`);
      console.log(`  -> "${r.newTitle}"`);
      console.log('');
    });
    console.log(`... and ${Math.max(0, results.length - 50)} more`);
  }
  
  if (updateAll) {
    console.log('Updating titles in database...\n');
    let updated = 0;
    let errors = 0;
    
    for (const result of results) {
      const analysis = analyses.find(a => a.id === result.id);
      if (!analysis) continue;
      
      // Only update if title is different
      if (analysis.title === result.newTitle) {
        continue;
      }
      
      analysis.title = result.newTitle;
      
      try {
        const response = await updateAnalysis(analysis);
        if (response.success || response.id) {
          updated++;
          console.log(`✓ ${result.newTitle}`);
        } else {
          errors++;
          console.log(`✗ ${result.fileName}: ${response.error || 'Unknown error'}`);
        }
      } catch (err) {
        errors++;
        console.log(`✗ ${result.fileName}: ${err.message}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\nDone! Updated: ${updated}, Errors: ${errors}`);
  }
}

main().catch(console.error);
