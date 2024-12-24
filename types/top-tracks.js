module.exports = task => {
    return new Promise(async (resolve, reject) => {
        try {
            const tracks = await api(`/me/top/tracks?limit=${task.typeOptions.limit ?? 50}`).then(i => {
                if (i.status !== 200) throw new Error("Failed to get top tracks");
                return i.data.items;
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