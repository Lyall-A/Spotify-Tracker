module.exports = [
    {
        name: "Weekly Top Tracks backup",
        type: "top-tracks",
        runOnStart: true,
        startDate: startOnWeek(1, 3), // Run on Monday's at 3 AM
        interval: 7 * 24 * 60, // Weekly
        typeOptions: {
            tracks: 50,
            playlistPublic: false,
            playlistName: () => `Top Tracks (${new Date().toLocaleDateString()})`,
            playlistDescription: (tracks) => {
                const artists = tracks.map(i => i.artists[0].name);
                const countMap = artists.reduce((acc, artist) => { acc[artist] = (acc[artist] || 0) + 1; return acc }, {});
                const sortedArtists = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
                return `${sortedArtists.map(([artist]) => artist).join(", ")} and more`
            }
        }
    },
    {
        name: "Weekly Discover Weekly backup",
        type: "discover-weekly",
        runOnStart: true,
        startDate: startOnWeek(1, 3), // Run on Monday's at 3 AM
        interval: 7 * 24 * 60, // Weekly
        typeOptions: {
            playlistPublic: false,
            playlistName: () => `Discover Weekly (${new Date().toLocaleDateString()})`,
            playlistDescription: () => `Generated backup for ${new Date().toLocaleDateString()}`
        }
    }
]

function startOnWeek(week, hours = 0, minutes = 0) {
    const date = new Date();
    const startDate = new Date();
    const dayMs = date - new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startDayMs = new Date(hours * 60 * 60 * 1000 + minutes * 60 * 1000);
    startDate.setDate(date.getDate() + ((week - date.getDay() + 7) % 7 || (startDayMs - dayMs >= 0 ? 0 : 7)));
    startDate.setHours(hours, minutes, 0, 0);
    return startDate;
}
