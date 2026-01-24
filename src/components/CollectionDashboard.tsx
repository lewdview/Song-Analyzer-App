import { SongAnalysis } from '../App';
import { 
  BarChart, Bar, PieChart, Pie, Cell, 
  ScatterChart, Scatter, 
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Music, TrendingUp } from 'lucide-react';

interface CollectionDashboardProps {
  analyses: SongAnalysis[];
}

export function CollectionDashboard({ analyses }: CollectionDashboardProps) {
  if (analyses.length === 0) {
    return (
      <div className="text-center py-12">
        <Music className="w-16 h-16 text-purple-300 mx-auto mb-4" />
        <p className="text-purple-200">No analyses to display. Upload and analyze some songs first!</p>
      </div>
    );
  }

  // Process data for visualizations
  const genreData = analyses.reduce((acc, analysis) => {
    analysis.genre.forEach(g => {
      acc[g] = (acc[g] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const genreChartData = Object.entries(genreData).map(([name, value]) => ({
    name,
    value
  }));

  const moodData = analyses.reduce((acc, analysis) => {
    analysis.mood.forEach(m => {
      acc[m] = (acc[m] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const moodChartData = Object.entries(moodData).map(([name, value]) => ({
    name,
    value
  }));

  const keyData = analyses.reduce((acc, analysis) => {
    acc[analysis.key] = (acc[analysis.key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const keyChartData = Object.entries(keyData).map(([name, value]) => ({
    name,
    value
  })).sort((a, b) => b.value - a.value);

  // Tempo distribution
  const tempoRanges = {
    'Slow (60-90)': 0,
    'Moderate (90-120)': 0,
    'Upbeat (120-150)': 0,
    'Fast (150-180)': 0,
    'Very Fast (180+)': 0,
  };

  analyses.forEach(a => {
    if (a.tempo < 90) tempoRanges['Slow (60-90)']++;
    else if (a.tempo < 120) tempoRanges['Moderate (90-120)']++;
    else if (a.tempo < 150) tempoRanges['Upbeat (120-150)']++;
    else if (a.tempo < 180) tempoRanges['Fast (150-180)']++;
    else tempoRanges['Very Fast (180+)']++;
  });

  const tempoChartData = Object.entries(tempoRanges).map(([name, value]) => ({
    name,
    value
  }));

  // Energy vs Danceability scatter
  const energyDanceData = analyses.map(a => ({
    energy: a.energy,
    danceability: a.danceability,
    name: a.fileName.substring(0, 20),
  }));

  // Average features comparison
  const avgFeatures = {
    energy: analyses.reduce((sum, a) => sum + a.energy, 0) / analyses.length,
    danceability: analyses.reduce((sum, a) => sum + a.danceability, 0) / analyses.length,
    valence: analyses.reduce((sum, a) => sum + a.valence, 0) / analyses.length,
    acousticness: analyses.reduce((sum, a) => sum + a.acousticness, 0) / analyses.length,
    instrumentalness: analyses.reduce((sum, a) => sum + a.instrumentalness, 0) / analyses.length,
    speechiness: analyses.reduce((sum, a) => sum + a.speechiness, 0) / analyses.length,
    liveness: analyses.reduce((sum, a) => sum + a.liveness, 0) / analyses.length,
  };

  const radarData = [
    { feature: 'Energy', value: avgFeatures.energy },
    { feature: 'Dance', value: avgFeatures.danceability },
    { feature: 'Valence', value: avgFeatures.valence },
    { feature: 'Acoustic', value: avgFeatures.acousticness },
    { feature: 'Instrumental', value: avgFeatures.instrumentalness },
    { feature: 'Speechiness', value: avgFeatures.speechiness },
    { feature: 'Liveness', value: avgFeatures.liveness },
  ];

  // Acousticness vs Instrumentalness scatter
  const acousticInstrumentalData = analyses.map(a => ({
    acousticness: a.acousticness,
    instrumentalness: a.instrumentalness,
    name: a.fileName.substring(0, 20),
  }));

  const COLORS = [
    '#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', 
    '#EF4444', '#6366F1', '#14B8A6', '#F97316', '#A855F7'
  ];

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-purple-500/20 rounded-lg p-6 border border-purple-400/30">
          <div className="flex items-center gap-2 mb-2">
            <Music className="w-5 h-5 text-purple-300" />
            <span className="text-purple-200 text-sm">Total Songs</span>
          </div>
          <p className="text-white text-3xl">{analyses.length}</p>
        </div>

        <div className="bg-blue-500/20 rounded-lg p-6 border border-blue-400/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-300" />
            <span className="text-blue-200 text-sm">Avg Tempo</span>
          </div>
          <p className="text-white text-3xl">
            {(analyses.reduce((sum, a) => sum + a.tempo, 0) / analyses.length).toFixed(0)} BPM
          </p>
        </div>

        <div className="bg-green-500/20 rounded-lg p-6 border border-green-400/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-300" />
            <span className="text-green-200 text-sm">Avg Energy</span>
          </div>
          <p className="text-white text-3xl">
            {(avgFeatures.energy * 100).toFixed(0)}%
          </p>
        </div>

        <div className="bg-pink-500/20 rounded-lg p-6 border border-pink-400/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-pink-300" />
            <span className="text-pink-200 text-sm">Avg Valence</span>
          </div>
          <p className="text-white text-3xl">
            {(avgFeatures.valence * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tempo Distribution */}
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h3 className="text-white mb-4">Tempo Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={tempoChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
              <YAxis tick={{ fill: '#cbd5e1' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="value" fill="#8B5CF6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Genre Distribution */}
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h3 className="text-white mb-4">Genre Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={genreChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {genreChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Energy vs Danceability */}
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h3 className="text-white mb-4">Energy vs Danceability</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis 
                type="number" 
                dataKey="energy" 
                name="Energy" 
                tick={{ fill: '#cbd5e1' }}
                label={{ value: 'Energy', position: 'insideBottom', offset: -5, fill: '#cbd5e1' }}
              />
              <YAxis 
                type="number" 
                dataKey="danceability" 
                name="Danceability" 
                tick={{ fill: '#cbd5e1' }}
                label={{ value: 'Danceability', angle: -90, position: 'insideLeft', fill: '#cbd5e1' }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              />
              <Scatter data={energyDanceData} fill="#EC4899" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Average Audio Features Radar */}
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h3 className="text-white mb-4">Average Audio Features</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#ffffff20" />
              <PolarAngleAxis dataKey="feature" tick={{ fill: '#cbd5e1' }} />
              <PolarRadiusAxis tick={{ fill: '#cbd5e1' }} />
              <Radar name="Features" dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Mood Distribution */}
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h3 className="text-white mb-4">Mood Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={moodChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
              <YAxis tick={{ fill: '#cbd5e1' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              />
              <Bar dataKey="value" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Musical Key Distribution */}
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h3 className="text-white mb-4">Musical Key Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={keyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis dataKey="name" tick={{ fill: '#cbd5e1' }} />
              <YAxis tick={{ fill: '#cbd5e1' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              />
              <Bar dataKey="value" fill="#F59E0B" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Acousticness vs Instrumentalness */}
        <div className="bg-white/5 rounded-lg p-6 border border-white/10 lg:col-span-2">
          <h3 className="text-white mb-4">Acousticness vs Instrumentalness</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis 
                type="number" 
                dataKey="acousticness" 
                name="Acousticness" 
                tick={{ fill: '#cbd5e1' }}
                label={{ value: 'Acousticness', position: 'insideBottom', offset: -5, fill: '#cbd5e1' }}
              />
              <YAxis 
                type="number" 
                dataKey="instrumentalness" 
                name="Instrumentalness" 
                tick={{ fill: '#cbd5e1' }}
                label={{ value: 'Instrumentalness', angle: -90, position: 'insideLeft', fill: '#cbd5e1' }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              />
              <Scatter data={acousticInstrumentalData} fill="#14B8A6" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
