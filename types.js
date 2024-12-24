module.exports = [
    {
        type: "top-tracks",
        name: "Top Tracks",
        description: "Creates a playlist of your top tracks",
        runScript: require("./types/top-tracks")
    },
    {
        type: "discover-weekly",
        name: "Discover Weekly",
        description: "Creates a backup of your Discover Weekly",
        runScript: require("./types/discover-weekly")
    },
]