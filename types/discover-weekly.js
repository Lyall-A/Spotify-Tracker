// NOTE: this will no longer work as of the recent API change here: https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api, fuck you Spotify

module.exports = task => {
    return new Promise(async (resolve, reject) => {
        try {
            const tracks = await api("/playlists/37i9dQZEVXcGR4CaVwTP4B").then(i => {
                if (i.status !== 200) throw new Error("Failed to get Discover Weekly playlist, this will be related to the API change here: https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api");
                return i.data.tracks.items.map(i => i.track);
            });

            const playlist = await api(`/me/playlists`, {
                method: "POST",
                body: JSON.stringify({
                    name: task.typeOptions.playlistName(tracks),
                    description: task.typeOptions.playlistDescription(tracks),
                    public: task.typeOptions.playlistPublic,
                })
            }).then(i => {
                if (i.status !== 201) throw new Error("Failed to create playlist");
                return i.data;
            });

            await api(`/playlists/${playlist.id}/tracks`, {
                method: "POST",
                body: JSON.stringify({
                    uris: tracks.map(i => i.uri)
                })
            }).then(i => {
                if (i.status !== 201) throw new Error("Failed to add tracks to playlist");
            });

            resolve();
        } catch (err) {
            reject(err);
        }
    });
}