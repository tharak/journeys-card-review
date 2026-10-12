# Delivery workflow

- After completing requested changes, commit the task's files and push to the remote.
- Check the GitHub Actions run for the pushed commit and wait for its build and deployment to finish.
- Tell the user when the build is ready, including the commit and published URL when available.
- Report any failed checks or deployment blockers clearly; do not describe a pending or failed build as ready.
